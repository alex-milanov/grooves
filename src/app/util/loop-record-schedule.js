import { context } from './audio';
import {
  barSeconds,
  getTransportStartTime,
  nextBarTime,
  nextLocalBarTime,
  nextLoopBarTime,
} from './transport-clock';
import { getActiveLoopCycle } from './loops-state';
import {
  anySessionActivity,
  DRUMS_TRACK_ID,
  hasRunningCycle,
  isTrackScheduling,
} from './session-transport';

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
};

/** Count-in + bar align for record arm only. */
export const emptySlotRecordSchedule = (state, clickOn) => {
  const bar = barSeconds(state.transport);
  const now = context.currentTime;
  const playing = anySessionActivity(state);

  if (playing) {
    return {
      startedAt: nextAlignedBarTime(state, now),
      countInAt: now,
      countInSilent: true,
      partialPlay: false,
    };
  }

  if (clickOn) {
    const countInAt = nextLocalBarTime(state.transport, now);
    return {
      startedAt: countInAt + bar,
      countInAt,
      countInSilent: false,
      partialPlay: false,
    };
  }

  return {
    startedAt: nextLocalBarTime(state.transport, now),
    ...clearArmFields,
  };
};

/** Fraction of a bar treated as “near” a cycle edge (one beat in 4/4). */
const CYCLE_EDGE = 0.125;

/** Play arm — no count-in; partial join only mid-cycle on a running grid. */
export const slotPlaySchedule = (state, slotIndex = null) => {
  const now = context.currentTime;
  const transport = state.transport;
  const bar = barSeconds(transport);

  if (!hasRunningCycle(state, slotIndex)) {
    return {
      startedAt: now,
      ...clearArmFields,
    };
  }

  const nextBar = nextAlignedBarTime(state, now);
  const prevBar = nextBar - bar;
  const elapsed = now - prevBar;
  const remaining = nextBar - now;
  const progress = bar > 0 ? elapsed / bar : 0;

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
    countInAt: now,
    countInSilent: true,
    partialPlay: true,
  };
};

export { nextAlignedBarTime };
