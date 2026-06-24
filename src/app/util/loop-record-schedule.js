import { context } from './audio';
import { barSeconds, nextBarTime, nextLocalBarTime } from './transport-clock';
import { anySessionActivity } from './session-transport';

/** Record arm times for an empty slot. */
export const emptySlotRecordSchedule = (state, clickOn) => {
  const bar = barSeconds(state.transport);
  const now = context.currentTime;
  const playing = anySessionActivity(state);

  if (playing) {
    const recordAt = state.transport?.playing
      ? nextBarTime(state.transport, now)
      : nextLocalBarTime(state.transport, now);
    return {
      startedAt: recordAt,
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
