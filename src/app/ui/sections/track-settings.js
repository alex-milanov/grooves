import {
  div, header, span, button, label, input, i,
} from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { patch } from '../../state';
import { previewCurrent } from '../../services/waveform';

const trackParams = (state, track) =>
  state.sequencer.trackParams?.[track] ?? {};

export default state => {
  const { selectedTrack, panels } = state.sequencer;
  const assignment = selectedTrack != null
    ? state.sequencer.assignments?.[selectedTrack]
    : null;
  const settingsOpen = selectedTrack != null && !!panels?.settings;
  const params = selectedTrack != null
    ? trackParams(state, selectedTrack)
    : {};
  const volume = params.volume ?? 0.85;
  const muted = params.muted ?? false;
  const hasSample = !!assignment;

  const samplePath = assignment
    ? `${assignment.kit} / ${assignment.sample}`
    : 'No sample assigned';

  return div('.track-settings', {
    class: {
      visible: settingsOpen,
      muted,
      empty: !hasSample,
    },
    props: {
      'aria-hidden': settingsOpen ? 'false' : 'true',
    },
  }, [
    header([
      span('.path', samplePath),
    ]),
    div('.waveform-wrap', [
      div('.waveform'),
      !hasSample ? span('.waveform-empty', 'Assign a sample from the library') : null,
    ]),
    div('.controls', [
      button('.preview-btn', {
        props: {
          type: 'button',
          title: 'Preview sample',
          disabled: !hasSample,
          'aria-label': 'Preview sample',
        },
        on: {
          click: () => previewCurrent(),
        },
      }, [
        i('.fa.fa-play'),
      ]),
      button('.mute-btn', {
        class: { active: muted },
        props: {
          type: 'button',
          title: muted ? 'Unmute track' : 'Mute track',
          disabled: !hasSample,
          'aria-label': muted ? 'Unmute track' : 'Mute track',
          'aria-pressed': String(muted),
        },
        on: {
          click: () => {
            if (selectedTrack == null) return;
            dispatch(patch(
              ['sequencer', 'trackParams', selectedTrack, 'muted'],
              !muted,
            ));
          },
        },
      }, [
        i(muted ? '.fa.fa-volume-off' : '.fa.fa-volume-up'),
      ]),
      label('.volume-label', [
        span('Vol'),
        input({
          props: {
            type: 'range',
            min: 0,
            max: 1,
            step: 0.01,
            value: volume,
            disabled: !hasSample,
          },
          on: {
            input: ev => {
              if (selectedTrack == null) return;
              dispatch(patch(
                ['sequencer', 'trackParams', selectedTrack, 'volume'],
                Number(ev.target.value),
              ));
            },
          },
        }),
      ]),
    ]),
  ]);
};
