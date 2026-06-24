import { context } from './audio';

let startTime = 0;

export const setTransportStartTime = (t) => {
  startTime = t;
};

export const getTransportStartTime = () => startTime;

export const resetTransportStartTime = () => {
  startTime = 0;
};

export const stepTime = (bpm) => 60 / bpm / 4;

/** Quarter-note beats per bar (4/4 → 4). Independent of sequencer resolution. */
export const beatsPerBar = (transport) => {
  const [num, den] = transport?.timeSignature ?? [4, 4];
  return num * (den > 0 ? 4 / den : 1);
};

/** One quarter-note beat at the current BPM. */
export const beatSeconds = (transport) => 60 / (transport?.bpm ?? 120);

/** One notated bar from time signature (4/4 → four quarter-note beats). */
export const barSeconds = (transport) => beatSeconds(transport) * beatsPerBar(transport);

export const nextLocalBarTime = (transport, fromTime = context.currentTime) => {
  const bar = barSeconds(transport);
  if (!bar) return fromTime + 0.05;
  const barsElapsed = Math.floor(fromTime / bar);
  const next = (barsElapsed + 1) * bar;
  return next <= fromTime + 0.001 ? next + bar : next;
};

export const nextBarTime = (transport, fromTime = context.currentTime) => {
  const bar = barSeconds(transport);
  const start = getTransportStartTime();
  if (!start || fromTime < start) {
    return fromTime + 0.05;
  }
  const barsElapsed = Math.floor((fromTime - start) / bar);
  return start + (barsElapsed + 1) * bar;
};

export const nextSlotCycleTime = (slotStartedAt, duration, fromTime = context.currentTime) => {
  if (!slotStartedAt || !duration) return fromTime + 0.05;
  const elapsed = fromTime - slotStartedAt;
  const cycles = Math.floor(elapsed / duration);
  return slotStartedAt + (cycles + 1) * duration;
};

export const phaseAt = (startedAt, duration, atTime = context.currentTime) => {
  if (!startedAt || !duration) return 0;
  const elapsed = (((atTime - startedAt) % duration) + duration) % duration;
  return elapsed / duration;
};

/** Anchor transport start so cycleDuration progress matches loop cycle phase at `now`. */
export const transportStartFromLoopPhase = (
  loopStartedAt,
  loopDuration,
  cycleDuration,
  now = context.currentTime,
) => {
  const elapsed = (((now - loopStartedAt) % loopDuration) + loopDuration) % loopDuration;
  const phase = elapsed / loopDuration;
  return now - phase * cycleDuration;
};

/** Next bar boundary on a playing loop's timeline. */
export const nextLoopBarTime = (
  transport,
  loopStartedAt,
  loopDuration,
  fromTime = context.currentTime,
) => {
  const bar = barSeconds(transport);
  if (!bar || !loopStartedAt || !loopDuration) return nextLocalBarTime(transport, fromTime);
  const elapsed = (((fromTime - loopStartedAt) % loopDuration) + loopDuration) % loopDuration;
  const intoBar = elapsed % bar;
  const remaining = intoBar < 0.001 ? bar : bar - intoBar;
  return fromTime + remaining;
};
