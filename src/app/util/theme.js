export const STORAGE_KEY = 'boilerplate-theme';
export const THEME_FAMILIES = ['pixel', 'terminal', 'studio', 'crm'];
export const THEME_MODES = ['light', 'dark'];

const LEGACY_FAMILIES = {
  slate: 'terminal',
  ocean: 'studio',
};

export const themeClass = (state) => `theme-${state.themeFamily}-${state.themeMode}`;

const normalizeFamily = (family) =>
  THEME_FAMILIES.includes(family) ? family : LEGACY_FAMILIES[family] || 'pixel';

export const parseStoredTheme = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (THEME_MODES.includes(parsed.mode)) {
      return {
        themeFamily: normalizeFamily(parsed.family),
        themeMode: parsed.mode,
      };
    }
    const [family, mode] = raw.split('-');
    if (THEME_MODES.includes(mode)) {
      return {
        themeFamily: normalizeFamily(family),
        themeMode: mode,
      };
    }
  } catch (_) {
    /* ignore */
  }
  return null;
};

export const getInitialTheme = () => {
  const stored = parseStoredTheme();
  if (stored) return stored;
  const mode =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  return { themeFamily: 'pixel', themeMode: mode };
};

export const serializeTheme = ({ themeFamily, themeMode }) =>
  JSON.stringify({ family: themeFamily, mode: themeMode });
