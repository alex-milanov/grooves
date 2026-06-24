import { div, header, span, button, label, input, i } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { patch } from '../../state';
import knob from '../components/knob';

const patchPart = (path, value) => dispatch(patch(['partMixer', ...path], value));
const patchBus = (bus, key, value) => dispatch(patch(['mixer', 'buses', bus, key], value));
const patchMaster = (value) => dispatch(patch(['mixer', 'master', 'volume'], value));

const msColumn = (title, body) =>
  div('.mixer-column', [header('.mixer-column-title', title), div('.mixer-column-body', body)]);

const muteSolo = (part) => [
  button(
    '.mixer-ms-btn.mute',
    {
      class: { active: part.muted },
      props: {
        type: 'button',
        title: part.muted ? 'Unmute' : 'Mute',
        'aria-pressed': String(part.muted),
      },
      on: { click: () => patchPart(['muted'], !part.muted) },
    },
    ['M'],
  ),
  button(
    '.mixer-ms-btn.solo',
    {
      class: { active: part.solo },
      props: {
        type: 'button',
        title: part.solo ? 'Unsolo' : 'Solo',
        'aria-pressed': String(part.solo),
      },
      on: { click: () => patchPart(['solo'], !part.solo) },
    },
    ['S'],
  ),
];

const verticalFader = (value, onChange, { min = 0, max = 1, step = 0.01 } = {}) =>
  label('.mixer-fader', [
    input({
      props: {
        type: 'range',
        min,
        max,
        step,
        value,
        orient: 'vertical',
      },
      on: { input: (ev) => onChange(Number(ev.target.value)) },
    }),
    span('.mixer-fader-value', Math.round(value * 100)),
  ]);

export default (state) => {
  const part = state.partMixer ?? {};
  const buses = state.mixer?.buses ?? {};
  const masterVol = state.mixer?.master?.volume ?? 1;
  const name = part.name ?? 'Drums';

  return div('.mixer-console', [
    div('.mixer-tracks', [
      msColumn(name, [
        verticalFader(part.volume ?? 1, (v) => patchPart(['volume'], v)),
        div('.mixer-ms', muteSolo(part)),
      ]),
    ]),
    div('.mixer-spacer'),
    div('.mixer-buses-master', [
      msColumn('Reverb', [
        knob({
          label: 'Sec',
          value: buses.reverb?.seconds ?? 3,
          min: 0.1,
          max: 8,
          step: 0.1,
          defaultValue: 3,
          onChange: (v) => patchBus('reverb', 'seconds', v),
        }),
        knob({
          label: 'Decay',
          value: buses.reverb?.decay ?? 2,
          min: 0.1,
          max: 8,
          step: 0.1,
          defaultValue: 2,
          onChange: (v) => patchBus('reverb', 'decay', v),
        }),
      ]),
      msColumn('Delay', [
        knob({
          label: 'Time',
          value: buses.delay?.time ?? 0.375,
          min: 0.05,
          max: 1,
          step: 0.01,
          defaultValue: 0.375,
          onChange: (v) => patchBus('delay', 'time', v),
        }),
        knob({
          label: 'Fb',
          value: buses.delay?.feedback ?? 0.35,
          min: 0,
          max: 0.95,
          step: 0.01,
          defaultValue: 0.35,
          onChange: (v) => patchBus('delay', 'feedback', v),
        }),
      ]),
      msColumn('Master', [verticalFader(masterVol, patchMaster)]),
    ]),
  ]);
};
