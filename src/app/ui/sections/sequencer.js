import {
  section, h2, h3, p, div, span, ul, li, button, header, i,
  fieldset, legend, form, label, input, table, tr, td, th,
} from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { patch } from '../../state';
const tracks = 4;
const steps = 16;

const list = length => new Array(length).fill(0);

export default state => div('.sequencer', [
  header([
    h2('Sequencer'),
    button('.play-toggle', {
      class: { active: state.sequencer.playing },
      props: {
        type: 'button',
        title: state.sequencer.playing ? 'Pause' : 'Play',
        'aria-label': state.sequencer.playing ? 'Pause' : 'Play',
        'aria-pressed': String(state.sequencer.playing),
      },
      on: {
        click: () => dispatch(
          patch(['sequencer', 'playing'], !state.sequencer.playing)
        ),
      },
    }, [
      i(state.sequencer.playing ? '.fa.fa-pause' : '.fa.fa-play'),
    ]),
    label('Tracks'),
    input({
      props: {
        type: 'number',
        value: state.tracks ?? tracks,
      },
      on: {
        input: ev => dispatch(s => ({ ...s, tracks: Number(ev.target.value) })),
      },
    }),
    label('Steps'),
    input({
      props: {
        type: 'number',
        value: state.steps ?? steps,
      },
      on: {
        input: ev => dispatch(s => ({ ...s, steps: Number(ev.target.value) })),
      },
    }),
  ]),
  div('.tracks',
    list(state.tracks ?? tracks).map((_, track) =>
      div('.track', [].concat(
        button({
          class: { active: state.sequencer.selectedTrack === track },
          on: {
            click: () => dispatch(patch(
              ['sequencer', 'selectedTrack'],
              state.sequencer.selectedTrack === track ? null : track,
            )),
          },
        }, `Track ${track}`),
        list(state.steps ?? steps).map((_, step) =>
          div('.step', {
            class: {
              active: state.sequencer.grid[track]?.[step],
            },
            props: {
              title: `${track},${step}`,
            },
            on: {
              click: () => dispatch(patch(['sequencer', 'grid', track, step], !state.sequencer.grid[track]?.[step]))
            },
          })
        )
      )),
    ),
  ),
]);