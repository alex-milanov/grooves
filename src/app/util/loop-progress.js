import { context } from '../services/audio';
import { barSeconds, phaseAt } from './transport-clock';
import { growingRecordProgress } from './loop-quantize';

const calcProgress = (startedAt, duration, atTime) => {
  if (!startedAt || !duration) return 0;
  return phaseAt(startedAt, duration, atTime) * 100;
};

const countInProgress = (countInAt, startedAt, atTime) => {
  const countInDuration = startedAt - countInAt;
  if (countInDuration <= 0) return 0;
  return Math.min(100, Math.max(0, ((atTime - countInAt) / countInDuration) * 100));
};

/**
 * Play/rec ring progress (0–100) from slot anchors + AudioContext clock.
 * Used by VDOM each frame (js-loop-station model).
 */
export const slotPlayRecProgress = (state, slot, atTime = context.currentTime) => {
  if (!slot) return { pct: 0, countIn: false };
  const { process, startedAt, duration, countInAt, partialPlay } = slot;
  const inPlayFade =
    process === 'play' && partialPlay && startedAt != null && atTime < startedAt - 0.001;

  if (inPlayFade && countInAt != null && startedAt != null) {
    return { pct: countInProgress(countInAt, startedAt, atTime), countIn: true };
  }
  if (process === 'play' && duration > 0) {
    return { pct: calcProgress(startedAt, duration, atTime), countIn: false };
  }
  if (process === 'record' && countInAt != null && startedAt != null && atTime < startedAt) {
    return { pct: countInProgress(countInAt, startedAt, atTime), countIn: true };
  }
  if (process === 'overdub' && duration > 0 && startedAt != null) {
    return { pct: calcProgress(startedAt, duration, atTime), countIn: false };
  }
  if (process === 'record' && startedAt != null) {
    return {
      pct: growingRecordProgress(startedAt, barSeconds(state.transport), atTime),
      countIn: false,
    };
  }
  return { pct: 0, countIn: false };
};
