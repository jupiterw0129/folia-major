import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { omni } from '../../../services/onlineMusic/omni';
import ThemedDialog from '../../shared/ThemedDialog';
import { SheetButton } from '../../shared/Sheet';

// Personal source authorization is separate from music-platform sign-in and never exposes the upstream key.
export default function PrivateSourceControl() {
    const { t } = useTranslation();
    const [configured, setConfigured] = useState(false);
    const [authenticated, setAuthenticated] = useState(false);
    const [open, setOpen] = useState(false);
    const [token, setToken] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    useEffect(() => {
        let active = true;
        void omni.getPrivateSourceSession().then(session => {
            if (active) { setConfigured(session.configured); setAuthenticated(session.authenticated); }
        });
        return () => { active = false; };
    }, [open]);
    if (!configured) return null;
    const close = () => { setOpen(false); setToken(''); setError(false); };
    const authorize = async () => {
        setBusy(true); setError(false);
        try {
            const ok = await omni.setPrivateSourceSession(authenticated ? null : token.trim());
            if (!ok) { setError(true); return; }
            setAuthenticated(!authenticated);
            close();
        } catch { setError(true); }
        finally { setBusy(false); }
    };
    return <>
        <button type="button" onClick={() => setOpen(true)}
            className="fixed bottom-4 left-4 z-[180] inline-flex items-center gap-2 rounded-full border border-white/20 bg-zinc-950/80 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-md hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            aria-label={t('privateSource.title')}>
            <KeyRound size={14} aria-hidden="true" />
            {t(authenticated ? 'privateSource.active' : 'privateSource.title')}
        </button>
        <ThemedDialog isOpen={open} onClose={close} closeDisabled={busy} title={t('privateSource.title')}
            description={t(authenticated ? 'privateSource.connected' : 'privateSource.description')}
            footer={<SheetButton variant="primary" disabled={busy || (!authenticated && !token.trim())} onClick={() => void authorize()}>
                {t(busy ? 'privateSource.wait' : authenticated ? 'privateSource.disconnect' : 'privateSource.connect')}
            </SheetButton>}>
            {!authenticated && <form onSubmit={event => { event.preventDefault(); if (!busy && token.trim()) void authorize(); }}>
                <label className="flex flex-col gap-2 text-sm text-[color:var(--st-t1)]">
                    {t('privateSource.passphrase')}
                    <input type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} disabled={busy}
                        className="rounded-lg border border-[var(--st-line)] bg-[var(--st-fill)] px-3 py-2 focus:outline-2 focus:outline-[var(--st-accent)]" />
                </label>
            </form>}
            {error && <p role="alert" className="mt-3 text-sm text-[color:var(--st-err)]">{t('privateSource.error')}</p>}
        </ThemedDialog>
    </>;
}
