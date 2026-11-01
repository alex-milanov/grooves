import { div } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import library from '../shared/library';
import sequencer from '../sections/sequencer';
import loops from '../sections/loops';
import mixer from '../sections/mixer';
import { SAMPLES_SECTION, LOOPS_SECTION } from '../../util/library';
import { assignRowSample } from '../../state/sequencer';
import { getDrumsRows, rowSample } from '../../state/drums';
import {
  assignLoopSample,
  DEFAULT_LOOP_SOURCE_BPM,
  getLoopSlot,
  loopBufferKey,
  loopPlaybackDuration,
} from '../../state/loops';
import { context, samples } from '../../services/audio';
import { quantizeTargetSeconds, trimPadBuffer } from '../../util/loop-quantize';
import { barSeconds } from '../../util/transport-clock';

const isAssignedDrumSample = (state, kit, sample) =>
  getDrumsRows(state).some((row) => {
    const a = rowSample(row);
    return a?.kit === kit && a?.sample === sample;
  });

const assignSampleToLoopSlot = (slotIndex, kit, sample) => {
  dispatch((s) => {
    const buffer = samples.get(samples.key(kit, sample));
    if (!buffer) {
      console.warn('loop sample not loaded:', kit, sample);
      return s;
    }
    const targetSeconds = quantizeTargetSeconds(buffer.duration, barSeconds(s.transport));
    const trimmed = trimPadBuffer(context, buffer, targetSeconds);
    const key = loopBufferKey(slotIndex, 0);
    samples.set(key, trimmed);
    const duration = loopPlaybackDuration(trimmed.duration, DEFAULT_LOOP_SOURCE_BPM, s.transport);
    return assignLoopSample(slotIndex, {
      bufferKey: key,
      sourceBpm: DEFAULT_LOOP_SOURCE_BPM,
      duration,
      kit,
      sample,
    })(s);
  });
};

export const drumsWorkspace = (state, { preview = false } = {}) => {
  const row = state.ui?.drums?.selectedRow;
  const open = row != null && !!state.ui?.drums?.panels?.library;
  const assignment = row != null ? rowSample(getDrumsRows(state)[row]) : null;
  const [editor, settings] = sequencer(state);

  return div('.workspace-inner', [
    preview
      ? null
      : library(state, {
          open,
          section: SAMPLES_SECTION,
          active: assignment,
          isAssigned: (kit, sample) => isAssignedDrumSample(state, kit, sample),
          onAssign: (kit, sample) => {
            if (row == null) return;
            dispatch(assignRowSample(row, kit, sample));
          },
        }),
    editor,
    preview ? null : settings,
  ]);
};

export const loopsWorkspace = (state, { preview = false } = {}) => {
  const slotIndex = state.ui?.loops?.selectedSlot;
  const open = slotIndex != null && !!state.ui?.loops?.panels?.library;
  const slot = slotIndex != null ? getLoopSlot(state, slotIndex) : null;
  const [editor, settings] = loops(state);

  return div('.workspace-inner', [
    preview
      ? null
      : library(state, {
          open,
          section: LOOPS_SECTION,
          active: slot ? { kit: slot.kit, sample: slot.sample } : null,
          onAssign: (kit, sample) => {
            if (slotIndex == null) return;
            assignSampleToLoopSlot(slotIndex, kit, sample);
          },
        }),
    editor,
    preview ? null : settings,
  ]);
};

export const mixerWorkspace = (state) => mixer(state);
