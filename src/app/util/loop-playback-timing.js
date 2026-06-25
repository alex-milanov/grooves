import { context } from './audio';
import { phaseAt } from './transport-clock';

/** Audio start time, fade-in end, and loop phase for buffer offset. */
export const slotPlaybackTiming = (slot, atTime = context.currentTime) => {
  const { startedAt, duration, partialPlay } = slot ?? {};
  if (!duration) {
    return { when: atTime, fadeUntil: null, phase: 0 };
  }

  if (!partialPlay) {
    const when = startedAt != null && startedAt > atTime + 0.001 ? startedAt : atTime;
    const phase =
      startedAt != null && startedAt <= atTime + 0.001
        ? phaseAt(startedAt, duration, when)
        : 0;
    return { when, fadeUntil: null, phase };
  }

  const when = atTime;
  const fadeUntil = startedAt != null && startedAt > when + 0.001 ? startedAt : null;
  const phase = startedAt ? phaseAt(startedAt, duration, when) : 0;
  return { when, fadeUntil, phase };
};
