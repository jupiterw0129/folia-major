import type { AudioQualityPreference, ProviderAudioSource } from '../../../types/onlineMusic';
import { OnlineProviderError } from '../../../types/onlineMusic';

// Optional same-origin private resolver; an HttpOnly cookie authorizes this browser for eight hours.
export interface CeruSession { configured: boolean; authenticated: boolean; providers: string[] }
let cached: { value: CeruSession; until: number } | null = null;
let pending: Promise<CeruSession> | null = null;
let cooldownUntil = 0;
const inactive: CeruSession = { configured: false, authenticated: false, providers: [] };

export async function getCeruSession(): Promise<CeruSession> {
    if (typeof window === 'undefined' || window.electron) return inactive;
    if (cached && cached.until > Date.now()) return cached.value;
    if (pending) return pending;
    pending = (async () => {
        try {
            const response = await fetch('/api/ceru/session', { credentials: 'same-origin', signal: AbortSignal.timeout(5000), cache: 'no-store' });
            const value = await response.json();
            if (!response.ok || typeof value.configured !== 'boolean' || !Array.isArray(value.providers)) return inactive;
            const session: CeruSession = { configured: value.configured, authenticated: value.authenticated === true, providers: value.providers.filter((id: unknown) => typeof id === 'string') };
            cached = { value: session, until: Date.now() + 30000 };
            return session;
        } catch { return inactive; }
        finally { pending = null; }
    })();
    return pending;
}

export async function setCeruSession(token: string | null): Promise<boolean> {
    const response = await fetch('/api/ceru/session', {
        method: token === null ? 'DELETE' : 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: token === null ? undefined : JSON.stringify({ token }),
        signal: AbortSignal.timeout(10000),
    });
    cached = null;
    if (!response.ok) return false;
    await getCeruSession();
    return true;
}

export async function resolveCeruAudio(providerId: string, mediaId: string, quality: AudioQualityPreference): Promise<ProviderAudioSource | null> {
    const session = await getCeruSession();
    if (!session.authenticated || !session.providers.includes(providerId)) return null;
    if (cooldownUntil > Date.now()) {
        throw new OnlineProviderError('unavailable', 'Ceru: please retry later', providerId, undefined, 429, cooldownUntil - Date.now());
    }
    let response: Response;
    try {
        response = await fetch('/api/ceru/resolve', {
            method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ providerId, mediaId, quality }), signal: AbortSignal.timeout(18000),
        });
    } catch {
        throw new OnlineProviderError('network', 'Ceru: timeout or network failure', providerId);
    }
    if (!response.ok) {
        if (response.status === 401) cached = null;
        if (response.status === 429) cooldownUntil = Date.now() + 60000;
        else if (response.status >= 500) cooldownUntil = Date.now() + 15000;
        throw new OnlineProviderError(response.status === 401 ? 'auth-required' : 'unavailable',
            `Ceru: ${response.status}`, providerId, undefined, response.status,
            response.status === 429 ? 60000 : undefined);
    }
    const data = await response.json() as ProviderAudioSource;
    if (typeof data.url !== 'string' || !data.url.startsWith('https://')) throw new OnlineProviderError('invalid-response', 'Ceru: invalid audio address', providerId);
    // The resolver cannot independently verify the encoding of the returned file; do not label its cache quality.
    return { url: data.url, fetchedAt: Date.now(), quality };
}
