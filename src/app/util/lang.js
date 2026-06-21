export const LANGS = ['en', 'bg'];

export const LANG_LABELS = {
  en: 'English',
  bg: 'Български',
};

export const flagSrc = lang => ({
  en: 'assets/flags/gb.svg',
  bg: 'assets/flags/bg.svg',
}[lang] ?? 'assets/flags/gb.svg');
