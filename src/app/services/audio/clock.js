import { context } from './graph';

/** Shared lookahead so session, drums, and loops cold-start on the same downbeat. */
export const TRANSPORT_START_LOOKAHEAD = 0.05;

let startTime = 0;

export const setTransportStartTime = (t) => {
  startTime = t;
};

export const getTransportStartTime = () => startTime;

export const resetTransportStartTime = () => {
  startTime = 0;
};

/** Absolute audio time for a fresh transport/loop cold start. */
export const nextTransportStart = (fromTime = context.currentTime) =>
  fromTime + TRANSPORT_START_LOOKAHEAD;
