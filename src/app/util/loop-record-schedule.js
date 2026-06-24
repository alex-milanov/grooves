import { context } from './audio';
import {
  barSeconds,
  getTransportStartTime,
  nextBarTime,
  nextLocalBarTime,
  nextLoopBarTime,
} from './transport-clock';
import { getActiveLoopCycle } from './loops-state';
import { anySessionActivity, DRUMS_TRACK_ID, isTrackScheduling } from './session-transport';

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

/** Bar-aligned start + optional count-in for record/play arm. */
export const slotBarSchedule = (state, clickOn) => {
  const bar = barSeconds(state.transport);
  const now = context.currentTime;
  const playing = anySessionActivity(state);

  if (playing) {
    return {
      startedAt: nextAlignedBarTime(state, now),
      countInAt: now,
      countInSilent: true,
    };
  }

  if (clickOn) {
    const countInAt = nextLocalBarTime(state.transport, now);
    return {
      startedAt: countInAt + bar,
      countInAt,
      countInSilent: false,
    };
  }

  return {
    startedAt: nextLocalBarTime(state.transport, now),
    countInAt: null,
    countInSilent: false,
  };
};

/** Record arm times for an empty slot. */
export const emptySlotRecordSchedule = (state, clickOn) => slotBarSchedule(state, clickOn);

/** Play arm times for an idle slot with content. */
export const slotPlaySchedule = (state, clickOn) => slotBarSchedule(state, clickOn);
