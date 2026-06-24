import { div, header, span, button, label, input } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { patch } from '../../state';
import { getLoopsTrack, patchLoopsMixer } from '../../util/loops-state';
import knob from '../components/knob';

const patchPart = (path, value) => dispatch(patch(['partMixer', ...path], value));
const patchLoopsPart = (path, value) => dispatch((s) => patchLoopsMixer(s, { [path[0]]: value }));
const patchBus = (bus, key, value) => dispatch(patch(['mixer', 'buses', bus, key], value));
const patchMaster = (value) => dispatch(patch(['mixer', 'master', 'volume'], value));

const msColumn = (title, body) =>
  div('.mixer-column', [header('.mixer-column-title', title), div('.mixer-column-body', body)]);

const muteSolo = (part, onMute, onSolo) => [
  button(
    '.mixer-ms-btn.mute',
    {
      class: { active: part.muted },
      props: {
        type: 'button',
        title: part.muted ? 'Unmute' : 'Mute',
        'aria-pressed': String(part.muted),
      },
      on: { click: onMute },
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
      on: { click: onSolo },
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

const trackColumn = (name, part, patchFn) =>
  msColumn(name, [
    verticalFader(part.volume ?? 1, (v) => patchFn(['volume'], v)),
    div(
      '.mixer-ms',
      muteSolo(
        part,
        () => patchFn(['muted'], !part.muted),
        () => patchFn(['solo'], !part.solo),
      ),
    ),
  ]);

export default (state) => {
  const drums = state.partMixer ?? {};
  const loopsTrack = getLoopsTrack(state);
  const loops = loopsTrack?.mixer ?? {};
  const buses = state.mixer?.buses ?? {};
  const masterVol = state.mixer?.master?.volume ?? 1;
  const drumsName = drums.name ?? 'Drums';
  const loopsName = loopsTrack?.name ?? 'Loops';

  return div('.mixer-console', [
    div('.mixer-tracks', [
      trackColumn(drumsName, drums, patchPart),
      trackColumn(loopsName, loops, patchLoopsPart),
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
