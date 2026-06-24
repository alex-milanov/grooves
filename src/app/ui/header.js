import { header, nav, a, div, img, i, span } from 'iblokz-snabbdom-helpers';

import { dispatch } from 'iblokz-state';
import { scrollToSection } from '../util/scroll';
import { patch } from '../state';
import { THEME_FAMILIES } from '../util/theme';
import { LANGS, LANG_LABELS, flagSrc } from '../util/lang';
import { themePreview } from '../util/theme-preview';
import { stripVisible } from '../util/workspaces';
import dropdown, { caret } from './components/dropdown';
import headerTransport from './header-transport';

const onHomeClick = (ev) => {
  ev.preventDefault();
  scrollToSection('#hero', '#hero');
};

const headerProgress = (scrollY) => Math.min(1, scrollY / 120);

const familyLabel = (family) => family.charAt(0).toUpperCase() + family.slice(1);

const modeLabel = (mode) => mode.charAt(0).toUpperCase() + mode.slice(1);

const nextThemeMode = (mode) => (mode === 'light' ? 'dark' : 'light');

const THEME_MODE_ICONS = {
  light: 'fa-sun-o',
  dark: 'fa-moon-o',
};

const SAVE_FORMATS = [
  { id: 'json', label: 'JSON' },
  { id: 'dawproject', label: 'DAWproject' },
  { id: 'midi', label: 'MIDI' },
  { id: 'musicxml', label: 'MusicXML' },
];

const langOption = (code) =>
  span('.lang-option', [
    span(
      '.flag-circle',
      img({
        props: {
          src: flagSrc(code),
          alt: '',
        },
      }),
    ),
    span('.lang-label', LANG_LABELS[code]),
  ]);

const themeOption = (family, mode, label) => {
  const preview = themePreview(family, mode);
  return span('.theme-option', [
    span('.theme-swatch', {
      style: { backgroundImage: preview.swatch },
    }),
    span(
      '.theme-name',
      {
        style: { fontFamily: preview.fontFamily },
      },
      label,
    ),
  ]);
};

export default (state) => {
  const lang = state.lang || 'en';
  const scrollY = state.viewport.screen.scroll?.y ?? 0;
  const progress = headerProgress(scrollY);

  return header(
    '.site-header.fixed-top',
    {
      class: { 'is-formed': progress > 0.05 },
      style: { '--header-progress': progress },
    },
    [
      nav('.site-nav', [
        div('.site-nav-start', [
          a(
            '.site-title[href="#hero"]',
            {
              on: { click: onHomeClick },
            },
            [
              img('.site-logo', {
                props: { src: 'assets/logo.svg', alt: '' },
              }),
              'Grooves',
            ],
          ),
        ]),
        div('.site-nav-center', [headerTransport(state)]),
        div('.site-nav-end.site-controls', [
          dropdown('.flags.control', {
            flags: true,
            handle: [
              img({
                props: {
                  src: flagSrc(lang),
                  alt: '',
                  title: LANG_LABELS[lang],
                },
              }),
            ],
            items: LANGS.map((code) => ({
              content: langOption(code),
              active: code === lang,
              onSelect: () => {
                if (code !== lang) dispatch(patch('lang', code));
              },
            })),
          }),
          dropdown('.theme-family.control', {
            handle: [
              themeOption(state.themeFamily, state.themeMode, familyLabel(state.themeFamily)),
              caret(),
            ],
            items: THEME_FAMILIES.map((family) => ({
              content: themeOption(family, state.themeMode, familyLabel(family)),
              active: family === state.themeFamily,
              onSelect: () => dispatch(patch('themeFamily', family)),
            })),
          }),
          a(
            '.theme-toggle.control.icon-only',
            {
              props: { title: modeLabel(state.themeMode) },
              on: {
                click: (ev) => {
                  ev.preventDefault();
                  dispatch(patch('themeMode', nextThemeMode(state.themeMode)));
                },
              },
            },
            [i(`.fa.${THEME_MODE_ICONS[state.themeMode]}`)],
          ),
          dropdown('.save.control.icon-only', {
            handle: [i('.fa.fa-floppy-o', { attrs: { title: 'Save' } })],
            toLeft: true,
            items: SAVE_FORMATS.map((format) => ({
              label: format.label,
              onSelect: () => {
                // Export wiring — JSON saves state directly (jam-station style)
              },
            })),
          }),
          a(
            '.workspaces-strip-toggle.control.icon-only',
            {
              class: { active: stripVisible(state) },
              props: {
                title: stripVisible(state) ? 'Hide workspaces' : 'Show workspaces',
              },
              on: {
                click: (ev) => {
                  ev.preventDefault();
                  dispatch(patch(['ui', 'workspacesStripOpen'], !stripVisible(state)));
                },
              },
            },
            [i(`.fa.${stripVisible(state) ? 'fa-chevron-up' : 'fa-th-large'}`)],
          ),
        ]),
      ]),
    ],
  );
};
