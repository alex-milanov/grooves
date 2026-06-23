import { div, header, span, button, label, input, i } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { patch } from '../../state';
import { previewCurrent } from '../../services/waveform';
import { getTrackParams } from '../../util/track-params';
import knob from '../components/knob';

export default (state) => {
  const { selectedTrack, panels } = state.sequencer;
  const assignment = selectedTrack != null ? state.sequencer.assignments?.[selectedTrack] : null;
  const settingsOpen = selectedTrack != null && !!panels?.settings;
  const params =
    selectedTrack != null
      ? getTrackParams(state.sequencer.trackParams, selectedTrack)
      : getTrackParams({}, 0);
  const hasSample = !!assignment;

  const samplePath = assignment ? `${assignment.kit} / ${assignment.sample}` : 'No sample assigned';

  const patchParam = (path, value) => {
    if (selectedTrack == null) return;
    dispatch(patch(['sequencer', 'trackParams', selectedTrack, ...path], value));
  };

  return div(
    '.track-settings',
    {
      class: {
        visible: settingsOpen,
        muted: params.muted,
        empty: !hasSample,
      },
      props: {
        'aria-hidden': settingsOpen ? 'false' : 'true',
      },
    },
    [
      header([span('.path', samplePath)]),
      div('.waveform-wrap', [
        div('.waveform'),
        !hasSample ? span('.waveform-empty', 'Assign a sample from the library') : null,
      ]),
      div('.controls', [
        button(
          '.preview-btn',
          {
            props: {
              type: 'button',
              title: 'Preview sample',
              disabled: !hasSample,
              'aria-label': 'Preview sample',
            },
            on: {
              click: () => previewCurrent(),
            },
          },
          [i('.fa.fa-play')],
        ),
        button(
          '.mute-btn',
          {
            class: { active: params.muted },
            props: {
              type: 'button',
              title: params.muted ? 'Unmute track' : 'Mute track',
              disabled: !hasSample,
              'aria-label': params.muted ? 'Unmute track' : 'Mute track',
              'aria-pressed': String(params.muted),
            },
            on: {
              click: () => patchParam(['muted'], !params.muted),
            },
          },
          [i(params.muted ? '.fa.fa-volume-off' : '.fa.fa-volume-up')],
        ),
        label('.volume-label', [
          span('Vol'),
          input({
            props: {
              type: 'range',
              min: 0,
              max: 1,
              step: 0.01,
              value: params.volume,
              disabled: !hasSample,
            },
            on: {
              input: (ev) => patchParam(['volume'], Number(ev.target.value)),
            },
          }),
        ]),
      ]),
      div('.fx-row', [
        knob({
          label: 'Cutoff',
          value: params.vcf.cutoff,
          disabled: !hasSample,
          onChange: (v) => patchParam(['vcf', 'cutoff'], v),
        }),
        knob({
          label: 'Res',
          value: params.vcf.resonance,
          disabled: !hasSample,
          onChange: (v) => patchParam(['vcf', 'resonance'], v),
        }),
        knob({
          label: 'Rev',
          value: params.sends.reverb,
          disabled: !hasSample,
          onChange: (v) => patchParam(['sends', 'reverb'], v),
        }),
        knob({
          label: 'Dly',
          value: params.sends.delay,
          disabled: !hasSample,
          onChange: (v) => patchParam(['sends', 'delay'], v),
        }),
      ]),
    ],
  );
};
