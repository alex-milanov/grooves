import { obj } from 'iblokz-data';
import {
  div,
  header,
  h2,
  ul,
  li,
  button,
  label,
  input,
  span,
  select,
  option,
} from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import {
  INPUT_GAIN_DB_MAX,
  INPUT_GAIN_DB_MIN,
  SETTINGS_TAB_AUDIO,
  SETTINGS_TAB_MIDI,
  SETTINGS_TAB_RECORDING,
  SETTINGS_TAB_SESSION,
  setRecordingInputGainDb,
  setSettingsTab,
} from '../../state/settings';
import {
  MIDI_INPUT_ANY,
  MIDI_SCHEME_MPK_MINI_IV,
  setMidiInputId,
  setMidiScheme,
} from '../../state/midi';
import { getScheme, retryAccess } from '../../services/midi';

const SETTINGS_TABS = [
  { id: SETTINGS_TAB_RECORDING, label: 'Recording' },
  { id: SETTINGS_TAB_MIDI, label: 'MIDI' },
  { id: SETTINGS_TAB_AUDIO, label: 'Audio' },
  { id: SETTINGS_TAB_SESSION, label: 'Session' },
];

const formatDb = (db) => {
  const rounded = Math.round(db * 10) / 10;
  const n = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${rounded > 0 ? '+' : ''}${n} dB`;
};

const placeholder = (title, blurb) =>
  div('.settings-pane-placeholder', [span('.settings-pane-blurb', blurb)]);

const recordingPane = (state) => {
  const gainDb = state.settings?.recording?.inputGainDb ?? 0;
  return div('.settings-pane.recording', [
    label('.settings-field', [
      span('.settings-field-label', 'Input gain'),
      input({
        props: {
          type: 'range',
          min: INPUT_GAIN_DB_MIN,
          max: INPUT_GAIN_DB_MAX,
          step: 0.5,
          value: gainDb,
          'aria-label': 'Input gain',
        },
        on: { input: (ev) => dispatch(setRecordingInputGainDb(Number(ev.target.value))) },
      }),
      span('.settings-field-value', formatDb(gainDb)),
    ]),
  ]);
};

const midiPane = (state) => {
  const midi = state.midi ?? {};
  const inputs = midi.devices?.inputs ?? [];
  const scheme = getScheme(midi.scheme ?? MIDI_SCHEME_MPK_MINI_IV);
  const supported = midi.supported;

  if (supported === false) {
    return div('.settings-pane.midi', [
      span(
        '.settings-pane-blurb',
        midi.accessError
          ? `MIDI access failed: ${midi.accessError}`
          : 'Web MIDI is not available in this browser (Chrome / Edge recommended).',
      ),
      button(
        '.settings-retry',
        {
          props: { type: 'button' },
          on: { click: () => retryAccess() },
        },
        'Retry',
      ),
    ]);
  }

  return div('.settings-pane.midi', [
    ...(supported == null ? [span('.settings-pane-blurb', 'Requesting MIDI access…')] : []),
    label('.settings-field', [
      span('.settings-field-label', 'Input'),
      select(
        {
          props: {
            value: midi.inputId ?? MIDI_INPUT_ANY,
            'aria-label': 'MIDI input device',
          },
          on: {
            change: (ev) => dispatch(setMidiInputId(ev.target.value)),
          },
        },
        [
          option({ props: { value: MIDI_INPUT_ANY } }, 'Any'),
          ...inputs.map((d) => option({ props: { value: d.id } }, d.name || d.id)),
        ],
      ),
    ]),
    label('.settings-field', [
      span('.settings-field-label', 'Scheme'),
      select(
        {
          props: {
            value: midi.scheme ?? MIDI_SCHEME_MPK_MINI_IV,
            'aria-label': 'MIDI control scheme',
          },
          on: {
            change: (ev) => dispatch(setMidiScheme(ev.target.value)),
          },
        },
        [option({ props: { value: MIDI_SCHEME_MPK_MINI_IV } }, scheme.label || 'MPK mini IV')],
      ),
    ]),
    ul(
      '.settings-midi-legend',
      (scheme.legend ?? []).map((line) => li(line)),
    ),
    span(
      '.settings-pane-blurb',
      'Pads/keys/knobs: MIDI Port. Hardware Play/Rec: DAW Port (always listened). Arm Record, then play to punch steps.',
    ),
  ]);
};

const panes = {
  [SETTINGS_TAB_RECORDING]: recordingPane,
  [SETTINGS_TAB_MIDI]: midiPane,
  [SETTINGS_TAB_AUDIO]: () =>
    placeholder('Audio', 'Output device, click level, and latency — coming soon.'),
  [SETTINGS_TAB_SESSION]: () =>
    placeholder('Session', 'Defaults for BPM, count-in, and quantize — coming soon.'),
  default: recordingPane,
};

export default (state) =>
  div('.settings-console', [
    header('.settings-console-header', [
      h2('Settings'),
      ul(
        '.settings-tabs',
        {
          props: { role: 'tablist', 'aria-label': 'Settings categories' },
        },
        SETTINGS_TABS.map(({ id, label: name }) =>
          li([
            button(
              '.settings-tab',
              {
                class: { active: state.settings?.tab === id },
                props: {
                  type: 'button',
                  role: 'tab',
                  'aria-selected': String(state.settings?.tab === id),
                  id: `settings-tab-${id}`,
                },
                on: { click: () => dispatch(setSettingsTab(id)) },
              },
              name,
            ),
          ]),
        ),
      ),
    ]),
    div(
      '.settings-pane-host',
      {
        props: {
          role: 'tabpanel',
          'aria-labelledby': `settings-tab-${state.settings?.tab}`,
        },
      },
      obj.switch(state.settings?.tab, panes)(state),
    ),
  ]);
