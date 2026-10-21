import { afterEach, describe, expect, it, vi } from 'vitest';

// Verify activation, platform identity and throttling at the Omni adapter boundary.
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('Ceru client', () => {
    it('keeps ordinary provider audio when not authorized', async () => {
        vi.stubGlobal('window', {});
        const fetch = vi.fn().mockResolvedValue(Response.json({ configured: true, authenticated: false, providers: ['netease'] }));
        vi.stubGlobal('fetch', fetch);
        const client = await import('../../../src/services/onlineMusic/ceru/ceruClient');
        expect(await client.resolveCeruAudio('netease', '123', 'high')).toBeNull();
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    it('leaves unsupported platforms alone', async () => {
        vi.stubGlobal('window', {});
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ configured: true, authenticated: true, providers: ['netease'] })));
        const client = await import('../../../src/services/onlineMusic/ceru/ceruClient');
        expect(await client.resolveCeruAudio('other', '123', 'high')).toBeNull();
    });
    it('sends source identity and selected quality without a secret', async () => {
        vi.stubGlobal('window', {});
        const fetch = vi.fn().mockResolvedValueOnce(Response.json({ configured: true, authenticated: true, providers: ['qq'] }))
            .mockResolvedValueOnce(Response.json({ url: 'https://audio.qq.com/a.mp3' }));
        vi.stubGlobal('fetch', fetch);
        const client = await import('../../../src/services/onlineMusic/ceru/ceruClient');
        expect((await client.resolveCeruAudio('qq', 'songMid', 'lossless'))?.url).toBe('https://audio.qq.com/a.mp3');
        expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ providerId: 'qq', mediaId: 'songMid', quality: 'lossless' });
    });
    it('avoids repeated network requests during a rate-limit cooldown', async () => {
        vi.stubGlobal('window', {});
        const fetch = vi.fn().mockResolvedValueOnce(Response.json({ configured: true, authenticated: true, providers: ['netease'] }))
            .mockResolvedValueOnce(Response.json({ error: 'rate-limited' }, { status: 429 }));
        vi.stubGlobal('fetch', fetch);
        const client = await import('../../../src/services/onlineMusic/ceru/ceruClient');
        await expect(client.resolveCeruAudio('netease', '123', 'high')).rejects.toMatchObject({ httpStatus: 429 });
        await expect(client.resolveCeruAudio('netease', '123', 'high')).rejects.toMatchObject({ httpStatus: 429 });
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});
