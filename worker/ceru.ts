// Private Ceru resolver. Secrets remain server-side; audio streams directly from supported CDNs.
export interface CeruEnv { CERU_API_KEY?: string; CERU_ACCESS_TOKEN?: string }
const COOKIE = '__Host-folia-ceru';
const sources: Record<string, string> = { netease: 'wy', qq: 'tx', kugou: 'kg' };
const qualities: Record<string, string> = { standard: '128k', high: '320k', ultra: '320k', lossless: 'flac', hires: 'hires' };
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
});

async function matches(value: string, expected: string): Promise<boolean> {
    const digest = (text: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const [a, b] = await Promise.all([digest(value), digest(expected)]);
    const left = new Uint8Array(a), right = new Uint8Array(b);
    let difference = 0;
    for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
    return difference === 0;
}

export function ceruAudioUrl(value: unknown): string | null {
    if (typeof value !== 'string' || value.length > 8192) return null;
    try {
        const url = new URL(value);
        const roots = ['music.126.net', 'music.163.com', 'qq.com', 'gtimg.cn', 'kugou.com', 'kgimg.com'];
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
        if (!roots.some(root => url.hostname === root || url.hostname.endsWith(`.${root}`))) return null;
        url.protocol = 'https:';
        return url.href;
    } catch { return null; }
}

export async function handleCeru(request: Request, env: CeruEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    const configured = Boolean(env.CERU_API_KEY && env.CERU_ACCESS_TOKEN);
    const token = (request.headers.get('cookie') ?? '').split(';').map(s => s.trim())
        .find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? '';
    const authenticated = configured && await matches(token, env.CERU_ACCESS_TOKEN!);
    if (request.method === 'GET' && path === '/api/ceru/session') return json({ configured, authenticated, providers: Object.keys(sources) });
    if (!configured) return json({ error: 'not-configured' }, 503);
    if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'forbidden-origin' }, 403);
    if (path === '/api/ceru/session' && request.method === 'DELETE') return json({ authenticated: false }, 200, {
        'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
    });
    if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);
    if (Number(request.headers.get('content-length') ?? 0) > 4096) return json({ error: 'invalid-request' }, 400);
    const text = await request.text();
    if (text.length > 4096) return json({ error: 'invalid-request' }, 400);
    let body: Record<string, unknown>;
    try {
        body = JSON.parse(text);
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    } catch { return json({ error: 'invalid-request' }, 400); }
    if (path === '/api/ceru/session') {
        if (typeof body.token !== 'string' || !await matches(body.token, env.CERU_ACCESS_TOKEN!)) return json({ error: 'unauthorized' }, 401);
        return json({ authenticated: true }, 200, {
            'set-cookie': `${COOKIE}=${env.CERU_ACCESS_TOKEN}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`,
        });
    }
    if (path !== '/api/ceru/resolve') return json({ error: 'not-found' }, 404);
    if (!authenticated) return json({ error: 'unauthorized' }, 401);
    const provider = typeof body.providerId === 'string' ? body.providerId : '';
    const quality = typeof body.quality === 'string' ? body.quality : '';
    if (!Object.hasOwn(sources, provider)) return json({ error: 'unsupported-provider' }, 400);
    if (!Object.hasOwn(qualities, quality) || typeof body.mediaId !== 'string' || !/^[a-zA-Z0-9]{1,128}$/.test(body.mediaId)) return json({ error: 'invalid-request' }, 400);
    const target = new URL('https://source.shiqianjiang.cn/api/music/url');
    target.search = new URLSearchParams({ source: sources[provider], songId: body.mediaId, quality: qualities[quality] }).toString();
    try {
        const signal = AbortSignal.timeout(15000);
        const options: RequestInit = {
            headers: { 'X-API-Key': env.CERU_API_KEY!, 'User-Agent': 'Folia-Ceru-Adapter/1.0' },
            signal, redirect: 'manual',
        };
        let currentTarget = target;
        let upstream = await fetch(currentTarget, options);
        for (let hop = 0; [301, 302, 303, 307, 308].includes(upstream.status); hop++) {
            const location = upstream.headers.get('location');
            const next = location ? new URL(location, currentTarget) : null;
            if (hop >= 3 || !next || next.origin !== target.origin || next.username || next.password) return json({ error: 'upstream-redirect' }, 502);
            await upstream.body?.cancel();
            currentTarget = next;
            upstream = await fetch(currentTarget, options);
        }
        if (upstream.status === 429) return json({ error: 'rate-limited' }, 429, { 'retry-after': '60' });
        if ([401, 403].includes(upstream.status)) return json({ error: 'upstream-auth' }, 502);
        if (!upstream.headers.get('content-type')?.includes('application/json')) return json({ error: 'upstream-error' }, 502);
        const data = await upstream.json() as { code?: number; url?: unknown };
        if (upstream.status === 429 || data.code === 429) return json({ error: 'rate-limited' }, 429, { 'retry-after': '60' });
        if ([401, 403].includes(upstream.status) || [401, 403].includes(data.code ?? 0)) return json({ error: 'upstream-auth' }, 502);
        if (!upstream.ok || ![0, 200].includes(data.code ?? -1)) return json({ error: 'upstream-error' }, 502);
        const url = ceruAudioUrl(data.url);
        return url ? json({ url, quality, fetchedAt: Date.now() }) : json({ error: 'invalid-audio-url' }, 502);
    } catch (error) {
        console.warn('[Ceru] Upstream request failed', { name: error instanceof Error ? error.name : 'UnknownError' });
        const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
        return json({ error: timeout ? 'timeout' : 'upstream-error' }, timeout ? 504 : 502);
    }
}
