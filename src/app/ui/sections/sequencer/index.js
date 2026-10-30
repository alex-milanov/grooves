import { div, h2, button, header, label, input, i } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { patch } from '../../../state';
import { deselectRow, openLibraryPanel, selectRow } from '../../../state/sequencer';
import {
  stepsPerBar,
  barCount,
  toggleMeasuresExpanded,
} from '../../../state/sequencer-measures';
import { DRUMS_TRACK_ID, trackTogglePlay, trackStop } from '../../../state/transport';
import measuresStrip from './measures-strip';
import rowsView from './rows';
import rowSettings from './row-settings';

const defaultRowCount = 4;
let rowClickTimer = null;

const clearRowClickTimer = () => {
  if (rowClickTimer) {
    clearTimeout(rowClickTimer);
    rowClickTimer = null;
  }
};

const onRowClick = (row, ev) => {
  if (ev.detail > 1) return;
  clearRowClickTimer();

  let deferDeselect = false;
  dispatch((s) => {
    if (s.sequencer.selectedRow !== row) {
      return selectRow(row)(s);
    }
    deferDeselect = true;
    return s;
  });

  if (deferDeselect) {
    rowClickTimer = setTimeout(() => {
      rowClickTimer = null;
      dispatch((s) => {
        if (s.sequencer.selectedRow === row) {
          return deselectRow(s);
        }
        return s;
      });
    }, 250);
  }
};

const onRowDblClick = (row, ev) => {
  ev.preventDefault();
  clearRowClickTimer();
  dispatch(openLibraryPanel(row));
};

export default (state) => {
  const perBar = stepsPerBar(state);
  const bars = barCount(state);
  const rows = state.sequencer.rows ?? defaultRowCount;
  const expanded = !!state.sequencer.measuresExpanded;
  const focusedBar = Math.min(bars - 1, Math.max(0, state.sequencer.focusedBar ?? 0));
  const playhead = state.transport?.playhead;
  const drumsTrack = state.tracks?.find((t) => t.id === DRUMS_TRACK_ID);
  const trackPlaying = !!drumsTrack?.transport?.playing;
  const playBar =
    trackPlaying && state.sequencer.playingBar != null
      ? Math.min(bars - 1, Math.max(0, state.sequencer.playingBar))
      : null;

  const cuedBar =
    state.sequencer.cuedBar == null
      ? null
      : Math.min(bars - 1, Math.max(0, state.sequencer.cuedBar));

  // One bar in the main grid. While a cue is pending, stay on the from-bar
  // (focusedBar) so the natural next bar never flashes before the jump.
  let viewBar = focusedBar;
  if (trackPlaying && playBar != null) {
    viewBar = cuedBar != null && playBar !== cuedBar ? focusedBar : playBar;
  }

  return [
    div('.sequencer', [
      header([
        h2('Sequencer'),
        button(
          '.track-transport-btn.play-toggle',
          {
            class: { active: trackPlaying },
            props: {
              type: 'button',
              title: trackPlaying ? 'Pause track' : 'Play track',
              'aria-label': trackPlaying ? 'Pause track' : 'Play track',
              'aria-pressed': String(trackPlaying),
            },
            on: { click: () => trackTogglePlay(DRUMS_TRACK_ID) },
          },
          [i(trackPlaying ? '.fa.fa-pause' : '.fa.fa-play')],
        ),
        button(
          '.track-transport-btn.stop',
          {
            props: {
              type: 'button',
              title: 'Stop track',
              'aria-label': 'Stop track',
              disabled: !trackPlaying,
            },
            on: { click: () => trackStop(DRUMS_TRACK_ID) },
          },
          [i('.fa.fa-stop')],
        ),
        label('Rows'),
        input({
          props: {
            type: 'number',
            value: rows,
            min: 1,
          },
          on: {
            input: (ev) =>
              dispatch((s) => {
                const next = Math.max(1, Number(ev.target.value));
                const prev = s.sequencer.rows ?? defaultRowCount;
                if (next > prev) {
                  const withSelect = selectRow(next - 1)(s);
                  return {
                    ...withSelect,
                    sequencer: { ...withSelect.sequencer, rows: next },
                  };
                }
                return { ...s, sequencer: { ...s.sequencer, rows: next } };
              }),
          },
        }),
        label('Sig.'),
        input({
          props: {
            type: 'number',
            value: state.transport?.timeSignature?.[0] ?? 4,
          },
          on: {
            input: (ev) =>
              dispatch(patch(['transport', 'timeSignature', 0], Number(ev.target.value))),
          },
        }),
        '/',
        input({
          props: {
            type: 'number',
            value: state.transport?.timeSignature?.[1] ?? 4,
          },
          on: {
            input: (ev) =>
              dispatch(patch(['transport', 'timeSignature', 1], Number(ev.target.value))),
          },
        }),
        label('Q'),
        input({
          props: {
            type: 'number',
            value: state.transport?.resolution ?? 16,
          },
          on: {
            input: (ev) => dispatch(patch(['transport', 'resolution'], Number(ev.target.value))),
          },
        }),
        button(
          '.measures-expand.track-transport-btn',
          {
            class: { active: expanded },
            props: {
              type: 'button',
              title: expanded ? 'Hide measures' : 'Show measures',
              'aria-label': expanded ? 'Hide measures' : 'Show measures',
              'aria-pressed': String(expanded),
            },
            on: { click: () => dispatch(toggleMeasuresExpanded) },
          },
          [i(expanded ? '.fa.fa-compress' : '.fa.fa-expand')],
        ),
      ]),
      expanded
        ? measuresStrip(state, {
            bars,
            perBar,
            rows,
            activeBar: viewBar,
            cuedBar,
            playing: trackPlaying,
          })
        : null,
      rowsView(state, {
        rows,
        bar: viewBar,
        stepsPerBar: perBar,
        playhead: trackPlaying && playBar === viewBar ? playhead : null,
        onRowClick,
        onRowDblClick,
      }),
    ]),
    rowSettings(state),
  ];
};
