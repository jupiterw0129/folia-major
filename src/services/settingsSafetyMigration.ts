// src/services/settingsSafetyMigration.ts
// Keep user-owned visual/player preferences recoverable across releases. This runs before the
// React bootstrap so a release can never overwrite the previous local settings without a snapshot.

const BACKUP_PREFIX = 'folia_settings_backup_v1:';
const LAST_BACKUP_VERSION_KEY = 'folia_settings_backup_last_version';
const BACKUP_KEYS = [
    'visualizer_', 'background_', 'lyrics_', 'subtitle_', 'preferred_', 'player_', 'stage_',
    'lattice_', 'library_wall_', 'scratchpad_', 'custom_', 'theme_', 'follow_system_theme',
    'disable_home_dynamic_background', 'use_cover_color_bg', 'default_theme_daylight',
    'random_visualizer_', 'smart_beat', 'visualizer_frame_rate', 'visualizer_glow_blur_quantize',
    'lyric_render_quality', 'window_titlebar_side',
];

const isBackuppableKey = (key: string): boolean => {
    if (key.startsWith(BACKUP_PREFIX)) return false;
    // Never copy provider sessions, tokens, cookies, or credentials into a second storage record.
    if (/(token|cookie|secret|password|credential|session|auth)/i.test(key)) return false;
    return BACKUP_KEYS.some(prefix => key === prefix || key.startsWith(prefix));
};

const getAppVersion = (): string | null => {
    try {
        return typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? __APP_VERSION__ : null;
    } catch {
        return null;
    }
};

export const backupSettingsBeforeRelease = (): void => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const version = getAppVersion();
    if (!version || localStorage.getItem(LAST_BACKUP_VERSION_KEY) === version) return;

    const values: Record<string, string> = {};
    for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !isBackuppableKey(key)) continue;
        const value = localStorage.getItem(key);
        if (value !== null) values[key] = value;
    }

    try {
        localStorage.setItem(`${BACKUP_PREFIX}${version}`, JSON.stringify({ version, savedAt: new Date().toISOString(), values }));
        localStorage.setItem(LAST_BACKUP_VERSION_KEY, version);
    } catch {
        // Quota errors must never prevent the app from starting.
    }
};

backupSettingsBeforeRelease();
