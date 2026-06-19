import {
  section, h2, h3, p, div, span, ul, li, button, header, i,
  fieldset, legend, form, label, input, table, tr, td, th,
} from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { patch } from '../../state';
// pipe function from iblokz-data fn.js
import { pipe } from 'iblokz-data/lib/fn.js';
const tracks = 4;

const list = length => (
  console.log('list', length), new Array(length).fill(0)
);

const shorten = (name, max = 14) =>
  name.length > max ? `${name.slice(0, max - 1)}…` : name;

export default state => pipe(
  () => state.sequencer,
  ({timeSignature, resolution}) => ({steps: Number(
    (resolution * (timeSignature[0] / timeSignature[1])).toFixed(0)
  )}),
  ({steps}) => div('.sequencer', [
  header([
    h2('Sequencer'),
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
    label('BPM'),
    input({
      props: {
        type: 'number',
        value: state.sequencer.bpm ?? 120,
      },
      on: {
        input: ev => dispatch(patch(['sequencer', 'bpm'], Number(ev.target.value))),
      },
    }),
    label('Sig.'), // Time signature
    input({
      props: {
        type: 'number',
        value: state.sequencer?.timeSignature?.[0] ?? 4,
      },
      on: {
        input: ev => dispatch(patch(['sequencer', 'timeSignature', 0], Number(ev.target.value))),
      },
    }),
    '/',
    input({
      props: {
        type: 'number',
        value: state.sequencer?.timeSignature?.[1] ?? 4,
      },
      on: {
        input: ev => dispatch(patch(['sequencer', 'timeSignature', 1], Number(ev.target.value))),
      },
    }),
    label('Q'),
    input({
      props: {
        type: 'number',
        value: state.sequencer?.resolution ?? 16,
      },
      on: {
        input: ev => dispatch(patch(['sequencer', 'resolution'], Number(ev.target.value))),
      },
    }),
  ]),
  div('.tracks',
    list(state.tracks ?? tracks).map((_, track) => {
      const sample = state.sequencer.assignments?.[track]?.sample;
      const label = sample ? shorten(sample) : `Track ${track}`;

      return div('.track', [].concat(
        button({
          class: {
            active: state.sequencer.selectedTrack === track,
            assigned: !!state.sequencer.assignments?.[track],
          },
          on: {
            click: () => dispatch(s => {
              const closing = s.sequencer.selectedTrack === track;
              if (closing) {
                return {
                  ...s,
                  sequencer: { ...s.sequencer, selectedTrack: null },
                };
              }
              const assignment = s.sequencer.assignments?.[track];
              return {
                ...s,
                sequencer: { ...s.sequencer, selectedTrack: track },
                library: assignment ? {
                  ...s.library,
                  path: ['library', assignment.kit],
                  selectedSample: assignment.sample,
                } : s.library,
              };
            }),
          },
        }, label),
        list(steps).map((_, step) =>
          div('.step', {
            class: {
              active: state.sequencer.grid[track]?.[step],
              playhead: state.sequencer.playhead === step,
            },
            props: {
              title: `${track},${step}`,
            },
            on: {
              click: () => dispatch(patch(['sequencer', 'grid', track, step], !state.sequencer.grid[track]?.[step]))
            },
          })
        )
      ));
    }),
  ),
]))();