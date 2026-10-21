import { afterEach, describe, expect, it, vi } from 'vitest';
import { ceruAudioUrl, handleCeru } from '../../../worker/ceru';

// Exercise the private resolver's authorization boundary, URL filtering and upstream failure handling.
const env = { CERU_API_KEY: 'test-upstream-key', CERU_ACCESS_TOKEN: 'test-personal-passphrase' };
function request(path: string, body: unknown, authorized = true, origin = 'https://music.example') {
    return new Request(`https://music.example/api/ceru/${path}`, {
        method: 'POST', headers: { origin, 'content-type': 'application/json',
            cookie: authorized ? '__Host-folia-ceru=test-personal-passphrase' : '' }, body: JSON.stringify(body),
    });
}
const song = { providerId: 'netease', mediaId: '12345', quality: 'lossless' };
afterEach(() => vi.unstubAllGlobals());
describe('Ceru private Worker', () => {
    it('rejects unauthorized and cross-origin requests before contacting upstream', async () => {
        const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
        expect((await handleCeru(request('resolve', song, false), env)).status).toBe(401);
        expect((await handleCeru(request('resolve', song, true, 'https://other.example'), env)).status).toBe(403);
        expect(fetch).not.toHaveBeenCalled();
    });
    it('sets a secure HttpOnly session only for the correct passphrase', async () => {
        expect((await handleCeru(request('session', { token: 'wrong' }), env)).status).toBe(401);
        const response = await handleCeru(request('session', { token: env.CERU_ACCESS_TOKEN }), env);
        expect(response.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Strict');
        expect(await response.text()).not.toContain(env.CERU_API_KEY);
    });
    it('maps source identity and quality and never returns the upstream secret', async () => {
        const fetch = vi.fn().mockResolvedValue(Response.json({ code: 200, url: 'http://m701.music.126.net/test.flac' }));
        vi.stubGlobal('fetch', fetch);
        const response = await handleCeru(request('resolve', song), env);
        const data = await response.json();
        expect(data.url).toBe('https://m701.music.126.net/test.flac');
        expect(String(fetch.mock.calls[0][0])).toContain('source=wy&songId=12345&quality=flac');
        expect(JSON.stringify(data)).not.toContain(env.CERU_API_KEY);
    });
    it('preserves rate limits and sanitizes upstream errors', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 429, message: env.CERU_API_KEY })));
        const response = await handleCeru(request('resolve', song), env);
        expect(response.status).toBe(429);
        expect(response.headers.get('retry-after')).toBe('60');
        expect(await response.text()).not.toContain(env.CERU_API_KEY);
    });
    it('rejects invalid inputs and unexpected audio hosts', async () => {
        expect((await handleCeru(request('resolve', { ...song, providerId: '__proto__' }), env)).status).toBe(400);
        expect((await handleCeru(request('resolve', { ...song, mediaId: '../x' }), env)).status).toBe(400);
        for (const value of ['http://127.0.0.1/a', 'https://music.126.net.evil.test/a', 'javascript:alert(1)', 'https://user@music.126.net/a']) {
            expect(ceruAudioUrl(value)).toBeNull();
        }
    });
    it('handles upstream timeout without leaking details', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('private detail', 'TimeoutError')));
        const response = await handleCeru(request('resolve', song), env);
        expect(response.status).toBe(504);
        expect(await response.json()).toEqual({ error: 'timeout' });
    });
    it('follows same-origin redirects without sending the key to another host', async () => {
        const fetch = vi.fn()
            .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/api/music/resolve' } }))
            .mockResolvedValueOnce(Response.json({ code: 200, url: 'https://music.126.net/test.mp3' }));
        vi.stubGlobal('fetch', fetch);
        expect((await handleCeru(request('resolve', song), env)).status).toBe(200);
        expect(String(fetch.mock.calls[1][0])).toBe('https://source.shiqianjiang.cn/api/music/resolve');
        expect(fetch.mock.calls[1][1].redirect).toBe('manual');
        fetch.mockReset().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://other.example/steal' } }));
        expect((await handleCeru(request('resolve', song), env)).status).toBe(502);
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    it('bounds redirect loops and safely handles non-JSON upstream failures', async () => {
        const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 302, headers: { location: '/loop' } })));
        vi.stubGlobal('fetch', fetch);
        expect((await handleCeru(request('resolve', song), env)).status).toBe(502);
        expect(fetch).toHaveBeenCalledTimes(4);
        fetch.mockReset().mockResolvedValue(new Response('<html>private upstream detail</html>', { status: 502 }));
        const response = await handleCeru(request('resolve', song), env);
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: 'upstream-error' });
    });
});
