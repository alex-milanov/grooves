import {
  div, h2, button, header, i, label, input,
} from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { patch } from '../../state';
import { pipe } from 'iblokz-data/lib/fn.js';
import {
  selectTrack,
  deselectTrack,
  openLibraryPanel,
} from '../../util/panels';

const tracks = 4;
let trackClickTimer = null;

const list = length => new Array(length).fill(0);

const shorten = (name, max = 14) =>
  name.length > max ? `${name.slice(0, max - 1)}…` : name;

const clearTrackClickTimer = () => {
  if (trackClickTimer) {
    clearTimeout(trackClickTimer);
    trackClickTimer = null;
  }
};

const onTrackClick = (track, ev) => {
  if (ev.detail > 1) return;
  clearTrackClickTimer();

  let deferDeselect = false;
  dispatch(s => {
    if (s.sequencer.selectedTrack !== track) {
      return selectTrack(s, track);
    }
    deferDeselect = true;
    return s;
  });

  if (deferDeselect) {
    trackClickTimer = setTimeout(() => {
      trackClickTimer = null;
      dispatch(s => {
        if (s.sequencer.selectedTrack === track) {
          return deselectTrack(s);
        }
        return s;
      });
    }, 250);
  }
};

const onTrackDblClick = (track, ev) => {
  ev.preventDefault();
  clearTrackClickTimer();
  dispatch(s => openLibraryPanel(s, track));
};

export default state => pipe(
  () => state.sequencer,
  ({ timeSignature, resolution }) => ({
    steps: Number(
      (resolution * (timeSignature[0] / timeSignature[1])).toFixed(0),
    ),
  }),
  ({ steps }) => div('.sequencer', [
    header([
      h2('Sequencer'),
      label('Tracks'),
      input({
        props: {
          type: 'number',
          value: state.tracks ?? tracks,
          min: 1,
        },
        on: {
          input: ev => dispatch(s => {
            const next = Math.max(1, Number(ev.target.value));
            const prev = s.tracks ?? tracks;
            if (next > prev) {
              return {
                ...selectTrack(s, next - 1),
                tracks: next,
              };
            }
            return { ...s, tracks: next };
          }),
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
            patch(['sequencer', 'playing'], !state.sequencer.playing),
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
      label('Sig.'),
      input({
        props: {
          type: 'number',
          value: state.sequencer?.timeSignature?.[0] ?? 4,
        },
        on: {
          input: ev => dispatch(
            patch(['sequencer', 'timeSignature', 0], Number(ev.target.value)),
          ),
        },
      }),
      '/',
      input({
        props: {
          type: 'number',
          value: state.sequencer?.timeSignature?.[1] ?? 4,
        },
        on: {
          input: ev => dispatch(
            patch(['sequencer', 'timeSignature', 1], Number(ev.target.value)),
          ),
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
        const trackLabel = sample ? shorten(sample) : `Track ${track}`;
        const panels = state.sequencer.panels ?? {};
        const isSelected = state.sequencer.selectedTrack === track;

        return div('.track', [].concat(
          button({
            class: {
              active: isSelected,
              assigned: !!state.sequencer.assignments?.[track],
              'panel-library': isSelected && panels.library,
              'panel-settings': isSelected && panels.settings,
            },
            props: {
              title: isSelected
                ? 'Click: deselect · Double-click: toggle library'
                : 'Click: select (library or settings) · Double-click: library',
            },
            on: {
              click: ev => onTrackClick(track, ev),
              dblclick: ev => onTrackDblClick(track, ev),
            },
          }, trackLabel),
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
                click: () => dispatch(
                  patch(['sequencer', 'grid', track, step],
                    !state.sequencer.grid[track]?.[step]),
                ),
              },
            }),
          ),
        ));
      }),
    ),
  ]),
)();
