import { header, nav, a, div, img, i, span } from 'iblokz-snabbdom-helpers';

import { dispatch } from 'iblokz-state';
import { patch } from '../state';
import { THEME_FAMILIES } from '../util/theme';
import { LANGS, LANG_LABELS, flagSrc } from '../util/lang';
import { themePreview } from '../util/theme-preview';
import { toggleFullscreen } from '../util/fullscreen';
import {
  openProject,
  saveProjectMidi,
  saveProjectYaml,
  saveProjectZip,
} from '../util/project/save-load';
import dropdown from './components/dropdown';
import headerTransport from './header-transport';

const headerProgress = (scrollY) => Math.min(1, scrollY / 120);

const familyLabel = (family) => family.charAt(0).toUpperCase() + family.slice(1);

const modeLabel = (mode) => mode.charAt(0).toUpperCase() + mode.slice(1);

const nextThemeMode = (mode) => (mode === 'light' ? 'dark' : 'light');

const THEME_MODE_ICONS = {
  light: 'fa-sun-o',
  dark: 'fa-moon-o',
};

const SAVE_FORMATS = [
  { id: 'yaml', label: 'YAML' },
  { id: 'zip', label: 'ZIP + media' },
  { id: 'midi', label: 'MIDI' },
  { id: 'dawproject', label: 'DAWproject', disabled: true },
  { id: 'musicxml', label: 'MusicXML', disabled: true },
];

const saveProject = (formatId, state) => {
  if (formatId === 'yaml') {
    saveProjectYaml(state);
    return;
  }
  if (formatId === 'zip') {
    saveProjectZip(state).catch((err) => console.error('project zip save failed:', err));
    return;
  }
  if (formatId === 'midi') {
    try {
      saveProjectMidi(state);
    } catch (err) {
      console.error('MIDI export failed:', err);
    }
    return;
  }
  console.warn('Save format not implemented yet:', formatId);
};

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
        div('.site-nav-start', [span('.site-title', ['Grooves'])]),
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
          dropdown('.theme-family.control.icon-only', {
            handle: [
              span(
                '.theme-option',
                {
                  props: { title: familyLabel(state.themeFamily) },
                },
                [
                  span('.theme-swatch', {
                    style: {
                      backgroundImage: themePreview(state.themeFamily, state.themeMode).swatch,
                    },
                  }),
                ],
              ),
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
          a(
            '.load.control.icon-only',
            {
              props: { title: 'Load project', 'aria-label': 'Load project' },
              on: {
                click: (ev) => {
                  ev.preventDefault();
                  openProject().catch((err) => console.error('project load failed:', err));
                },
              },
            },
            [i('.fa.fa-folder-open-o')],
          ),
          dropdown('.save.control.icon-only', {
            handle: [i('.fa.fa-floppy-o', { attrs: { title: 'Save project' } })],
            toLeft: true,
            items: SAVE_FORMATS.map((format) => ({
              label: format.label,
              disabled: !!format.disabled,
              onSelect: () => saveProject(format.id, state),
            })),
          }),
          a(
            '.workspaces-strip-toggle.control.icon-only',
            {
              class: { active: !!state.ui?.workspacesStripOpen },
              props: {
                title: state.ui?.workspacesStripOpen ? 'Hide workspaces' : 'Show workspaces',
              },
              on: {
                click: (ev) => {
                  ev.preventDefault();
                  dispatch(patch(['ui', 'workspacesStripOpen'], !state.ui?.workspacesStripOpen));
                },
              },
            },
            [i(`.fa.${state.ui?.workspacesStripOpen ? 'fa-chevron-up' : 'fa-th-large'}`)],
          ),
          a(
            '.fullscreen-toggle.control.icon-only',
            {
              class: { active: !!state.viewport?.fullscreen },
              props: {
                title: state.viewport?.fullscreen ? 'Exit fullscreen' : 'Enter fullscreen',
                'aria-label': state.viewport?.fullscreen ? 'Exit fullscreen' : 'Enter fullscreen',
                'aria-pressed': String(!!state.viewport?.fullscreen),
              },
              on: {
                click: (ev) => {
                  ev.preventDefault();
                  toggleFullscreen();
                },
              },
            },
            [i(`.fa.${state.viewport?.fullscreen ? 'fa-compress' : 'fa-expand'}`)],
          ),
        ]),
      ]),
    ],
  );
};
