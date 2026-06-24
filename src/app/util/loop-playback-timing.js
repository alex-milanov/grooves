import { context } from './audio';
import { phaseAt } from './transport-clock';

export const isFullCountIn = (slot) =>
  slot?.countInAt != null &&
  !slot?.countInSilent &&
  slot?.startedAt != null &&
  slot.startedAt > slot.countInAt + 0.001;

/** Audio start time, fade-in end, and loop phase for buffer offset. */
export const slotPlaybackTiming = (slot, atTime = context.currentTime) => {
  const { startedAt, duration, countInAt } = slot ?? {};
  if (!duration) {
    return { when: atTime, fadeUntil: null, phase: 0 };
  }

  if (isFullCountIn(slot)) {
    const when = Math.max(atTime, countInAt);
    const elapsed = Math.max(0, when - countInAt);
    const phase = (elapsed % duration) / duration;
    const fadeUntil = startedAt > when + 0.001 ? startedAt : null;
    return { when, fadeUntil, phase };
  }

  const when = atTime;
  const fadeUntil = startedAt != null && startedAt > when + 0.001 ? startedAt : null;
  const phase = startedAt ? phaseAt(startedAt, duration, when) : 0;
  return { when, fadeUntil, phase };
};
