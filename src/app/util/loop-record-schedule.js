import { context } from './audio';
import {
  barSeconds,
  getTransportStartTime,
  nextBarTime,
  nextLocalBarTime,
  nextLoopBarTime,
} from './transport-clock';
import { CYCLE_EDGE } from './loop-quantize';
import { getActiveLoopCycle } from './loops-state';
import {
  anySessionActivity,
  DRUMS_TRACK_ID,
  hasRunningCycle,
  isTrackScheduling,
} from './session-transport';

/** Cold-start downbeat: prefer a shared future transport anchor when present. */
const coldStartAt = (now = context.currentTime) => {
  const start = getTransportStartTime();
  return start > now + 0.001 ? start : now;
};

/** Bar grid from session, playing drums, or a playing loop. */
const nextAlignedBarTime = (state, fromTime = context.currentTime) => {
  const start = getTransportStartTime();
  const onDrumsGrid =
    start > 0 && (state.transport?.playing || isTrackScheduling(state, DRUMS_TRACK_ID));
  if (onDrumsGrid) return nextBarTime(state.transport, fromTime);

  const loop = getActiveLoopCycle(state);
  if (loop) {
    return nextLoopBarTime(state.transport, loop.startedAt, loop.duration, fromTime);
  }

  return nextLocalBarTime(state.transport, fromTime);
};

const clearArmFields = {
  countInAt: null,
  countInSilent: false,
  partialPlay: false,
  leadPadSeconds: 0,
};

/** Position within the current aligned bar. */
const barProgress = (state, now = context.currentTime) => {
  const bar = barSeconds(state.transport);
  const nextBar = nextAlignedBarTime(state, now);
  const prevBar = nextBar - bar;
  const elapsed = now - prevBar;
  const remaining = nextBar - now;
  const progress = bar > 0 ? elapsed / bar : 0;
  return { bar, nextBar, prevBar, elapsed, remaining, progress };
};

/** Count-in + bar align for record arm only. */
export const emptySlotRecordSchedule = (state, clickOn) => {
  const bar = barSeconds(state.transport);
  const now = context.currentTime;
  const playing = anySessionActivity(state);

  if (playing) {
    const { nextBar, prevBar, remaining, progress } = barProgress(state, now);

    // Near end of bar — wait for the next downbeat.
    if (remaining <= bar * CYCLE_EDGE) {
      return {
        startedAt: nextBar,
        ...clearArmFields,
        countInAt: now,
        countInSilent: true,
      };
    }

    // First 1/8 of the bar — punch in now; lead pad is measured at actual record start.
    if (progress <= CYCLE_EDGE) {
      return {
        startedAt: prevBar,
        ...clearArmFields,
      };
    }

    // Mid-bar — wait for the next downbeat.
    return {
      startedAt: nextBar,
      ...clearArmFields,
      countInAt: now,
      countInSilent: true,
    };
  }

  if (clickOn) {
    const countInAt = nextLocalBarTime(state.transport, now);
    return {
      startedAt: countInAt + bar,
      ...clearArmFields,
      countInAt,
      countInSilent: false,
    };
  }

  return {
    startedAt: nextLocalBarTime(state.transport, now),
    ...clearArmFields,
  };
};

/** Play arm — no count-in; partial join only mid-cycle on a running grid. */
export const slotPlaySchedule = (state, slotIndex = null) => {
  const now = context.currentTime;
  const { bar, nextBar, prevBar, remaining, progress } = barProgress(state, now);

  if (!hasRunningCycle(state, slotIndex)) {
    return {
      startedAt: coldStartAt(now),
      ...clearArmFields,
    };
  }

  if (remaining <= bar * CYCLE_EDGE) {
    return {
      startedAt: nextBar,
      ...clearArmFields,
    };
  }

  if (progress <= CYCLE_EDGE) {
    return {
      startedAt: prevBar,
      ...clearArmFields,
    };
  }

  return {
    startedAt: nextBar,
    ...clearArmFields,
    countInAt: now,
    countInSilent: true,
    partialPlay: true,
  };
};

export { nextAlignedBarTime };
