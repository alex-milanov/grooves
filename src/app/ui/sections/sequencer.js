import { div, h2, button, header, label, input, i } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { patch } from '../../state';
import { pipe } from 'iblokz-data/lib/fn.js';
import { selectTrack, deselectTrack, openLibraryPanel } from '../../util/panels';
import { DRUMS_TRACK_ID, trackTogglePlay, trackStop } from '../../util/session-transport';

const rowCount = 4;
let trackClickTimer = null;

const list = (length) => new Array(length).fill(0);

const shorten = (name, max = 14) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);

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
  dispatch((s) => {
    if (s.sequencer.selectedTrack !== track) {
      return selectTrack(s, track);
    }
    deferDeselect = true;
    return s;
  });

  if (deferDeselect) {
    trackClickTimer = setTimeout(() => {
      trackClickTimer = null;
      dispatch((s) => {
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
  dispatch((s) => openLibraryPanel(s, track));
};

export default (state) =>
  pipe(
    () => state.transport,
    ({ timeSignature, resolution }) => ({
      steps: Number((resolution * (timeSignature[0] / timeSignature[1])).toFixed(0)),
    }),
    ({ steps }) => {
      const drumsTrack = state.tracks?.find((t) => t.id === DRUMS_TRACK_ID);
      const trackPlaying = !!drumsTrack?.transport?.playing;

      return div('.sequencer', [
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
              value: state.sequencer.tracks ?? rowCount,
              min: 1,
            },
            on: {
              input: (ev) =>
                dispatch((s) => {
                  const next = Math.max(1, Number(ev.target.value));
                  const prev = s.sequencer.tracks ?? rowCount;
                  if (next > prev) {
                    return {
                      ...selectTrack(s, next - 1),
                      sequencer: { ...s.sequencer, tracks: next },
                    };
                  }
                  return { ...s, sequencer: { ...s.sequencer, tracks: next } };
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
        ]),
        div(
          '.tracks',
          list(state.sequencer.tracks ?? rowCount).map((_, track) => {
            const sample = state.sequencer.assignments?.[track]?.sample;
            const trackLabel = sample ? shorten(sample) : `Track ${track}`;
            const panels = state.sequencer.panels ?? {};
            const isSelected = state.sequencer.selectedTrack === track;

            return div(
              '.track',
              [].concat(
                button(
                  {
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
                      click: (ev) => onTrackClick(track, ev),
                      dblclick: (ev) => onTrackDblClick(track, ev),
                    },
                  },
                  trackLabel,
                ),
                list(steps).map((_, step) =>
                  div('.step', {
                    class: {
                      active: state.sequencer.grid[track]?.[step],
                      playhead: state.transport?.playhead === step,
                    },
                    props: {
                      title: `${track},${step}`,
                    },
                    on: {
                      click: () =>
                        dispatch(
                          patch(
                            ['sequencer', 'grid', track, step],
                            !state.sequencer.grid[track]?.[step],
                          ),
                        ),
                    },
                  }),
                ),
              ),
            );
          }),
        ),
      ]);
    },
  )();
