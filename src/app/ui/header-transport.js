import { div, button, label, input, i, span } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { patch } from '../state';
import { sessionTogglePlay, sessionStop, anySessionActivity } from '../util/session-transport';

const clampBpm = (value) => Math.min(300, Math.max(40, value || 120));

export default (state) => {
  const { playing, bpm } = state.transport ?? {};
  const tempo = bpm ?? 120;
  const canStop = anySessionActivity(state);

  return div('.site-transport', [
    button(
      '.transport-btn.play-toggle',
      {
        class: { active: playing },
        props: {
          type: 'button',
          title: playing ? 'Pause session' : 'Play session',
          'aria-label': playing ? 'Pause session' : 'Play session',
          'aria-pressed': String(playing),
        },
        on: { click: sessionTogglePlay },
      },
      [i(playing ? '.fa.fa-pause' : '.fa.fa-play')],
    ),
    button(
      '.transport-btn.stop',
      {
        props: {
          type: 'button',
          title: 'Stop session',
          'aria-label': 'Stop session',
          disabled: !canStop,
        },
        on: { click: sessionStop },
      },
      [i('.fa.fa-stop')],
    ),
    label('.transport-bpm', [
      span('.transport-bpm-label', 'BPM'),
      input({
        props: {
          type: 'number',
          min: 40,
          max: 300,
          step: 1,
          value: tempo,
          'aria-label': 'Tempo in BPM',
        },
        on: {
          input: (ev) => dispatch(patch(['transport', 'bpm'], clampBpm(Number(ev.target.value)))),
        },
      }),
    ]),
  ]);
};
