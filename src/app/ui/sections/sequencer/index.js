import { div, h2, button, header, label, input, i } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { patch } from '../../../state';
import {
  deselectRow,
  openLibraryPanel,
  selectRow,
  setRowCount,
} from '../../../state/sequencer';
import {
  stepsPerBar,
  barCount,
  toggleMeasuresExpanded,
} from '../../../state/sequencer-measures';
import { drumsRowCount } from '../../../state/drums';
import { DRUMS_TRACK_ID, trackTogglePlay, trackStop } from '../../../state/transport';
import measuresStrip from './measures-strip';
import rowsView from './rows';
import rowSettings from './row-settings';

let rowClickTimer = null;

const drumsUi = (state) => state.ui?.drums ?? {};

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
    if (drumsUi(s).selectedRow !== row) {
      return selectRow(row)(s);
    }
    deferDeselect = true;
    return s;
  });

  if (deferDeselect) {
    rowClickTimer = setTimeout(() => {
      rowClickTimer = null;
      dispatch((s) => {
        if (drumsUi(s).selectedRow === row) {
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
  const ui = drumsUi(state);
  const perBar = stepsPerBar(state);
  const bars = barCount(state);
  const rows = drumsRowCount(state);
  const expanded = !!ui.measuresExpanded;
  const currentBar = Math.min(bars - 1, Math.max(0, ui.currentBar ?? 0));
  const playhead = state.transport?.playhead;
  const drumsTrack = state.tracks?.find((t) => t.id === DRUMS_TRACK_ID);
  const trackPlaying = !!drumsTrack?.transport?.playing;

  const cuedBar =
    ui.cuedBar == null ? null : Math.min(bars - 1, Math.max(0, ui.cuedBar));

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
                const prev = drumsRowCount(s);
                const withCount = setRowCount(next)(s);
                if (next > prev) return selectRow(next - 1)(withCount);
                return withCount;
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
            activeBar: currentBar,
            cuedBar,
            playing: trackPlaying,
          })
        : null,
      rowsView(state, {
        rows,
        bar: currentBar,
        stepsPerBar: perBar,
        playhead: trackPlaying ? playhead : null,
        onRowClick,
        onRowDblClick,
      }),
    ]),
    rowSettings(state),
  ];
};
