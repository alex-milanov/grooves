import { div, header, span, button, label, input, i } from 'iblokz-snabbdom-helpers';
import knob from '../components/knob';
import { previewLoopSlot } from '../../services/waveform';
import { getLoopSlot, getSlotParams, slotHasContent } from '../../util/loops-state';
import { patchSlotParam } from '../../util/loop-actions';

export default (state) => {
  const selectedSlot = state.ui?.loops?.selectedSlot;
  const panels = state.ui?.loops?.panels ?? {};
  const settingsOpen = selectedSlot != null && !!panels.settings;
  const slot = selectedSlot != null ? getLoopSlot(state, selectedSlot) : null;
  const params = getSlotParams(slot);
  const hasContent = slotHasContent(slot);
  const labelText = selectedSlot != null ? `Slot ${selectedSlot + 1}` : 'No slot selected';

  const patchParam = (path, value) => {
    if (selectedSlot == null) return;
    patchSlotParam(selectedSlot, path, value);
  };

  return div(
    '.track-settings.loop-slot-settings',
    {
      class: {
        visible: settingsOpen,
        muted: params.muted,
        empty: !hasContent,
      },
      props: { 'aria-hidden': settingsOpen ? 'false' : 'true' },
    },
    [
      header([span('.path', labelText)]),
      div('.waveform-wrap', [
        div('.waveform'),
        !hasContent ? span('.waveform-empty', 'Record or assign a loop') : null,
      ]),
      div('.controls', [
        button(
          '.preview-btn',
          {
            props: {
              type: 'button',
              title: 'Preview loop',
              disabled: !hasContent,
              'aria-label': 'Preview loop',
            },
            on: { click: () => previewLoopSlot() },
          },
          [i('.fa.fa-play')],
        ),
        button(
          '.mute-btn',
          {
            class: { active: params.muted },
            props: {
              type: 'button',
              title: params.muted ? 'Unmute slot' : 'Mute slot',
              disabled: !hasContent,
              'aria-pressed': String(params.muted),
            },
            on: { click: () => patchParam(['muted'], !params.muted) },
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
              disabled: !hasContent,
            },
            on: { input: (ev) => patchParam(['volume'], Number(ev.target.value)) },
          }),
        ]),
      ]),
      div('.fx-row', [
        knob({
          label: 'Cutoff',
          value: params.vcf.cutoff,
          defaultValue: 0.64,
          disabled: !hasContent,
          onChange: (v) => patchParam(['vcf', 'cutoff'], v),
        }),
        knob({
          label: 'Res',
          value: params.vcf.resonance,
          defaultValue: 0,
          disabled: !hasContent,
          onChange: (v) => patchParam(['vcf', 'resonance'], v),
        }),
        knob({
          label: 'Rev',
          value: params.sends.reverb,
          defaultValue: 0,
          disabled: !hasContent,
          onChange: (v) => patchParam(['sends', 'reverb'], v),
        }),
        knob({
          label: 'Dly',
          value: params.sends.delay,
          defaultValue: 0,
          disabled: !hasContent,
          onChange: (v) => patchParam(['sends', 'delay'], v),
        }),
      ]),
    ],
  );
};
