/** Lead-in so session / drums / loops cold-start on the same future downbeat. */
export const TRANSPORT_START_LOOKAHEAD = 0.05;

/** Absolute audio time for a fresh transport/loop cold start. */
export const nextTransportStart = (fromTime) => fromTime + TRANSPORT_START_LOOKAHEAD;

/** Step length (s). `resolution` = transport Q (steps per whole note; 16 → 16ths). */
export const stepTime = (bpm, res = 16) => (60 / bpm) * 4 / res;

/**
 * Steps in one bar — world-metronome `measureToBeatLength`, with Q as the base
 * (`16 * num / den` when resolution is 16). Reads indices (not array destructure)
 * so a corrupted length-0 timeSignature still works.
 */
export const measureStepCount = (num, den, resolution = 16) => {
  const n = parseInt(num, 10);
  const d = parseInt(den, 10);
  const q = parseInt(resolution, 10) || 16;
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return q;
  return Math.max(1, Math.round((q * n) / d));
};

/**
 * Quarter-note beats in one bar (`num * 4 / den`), so BPM (quarter notes) maps
 * across meters: 4/4 → 4, 7/4 → 7, 6/8 → 3. Not sequencer Q.
 */
export const beatsPerBar = (transport) => {
  const num = parseInt(transport?.timeSignature?.[0], 10) || 4;
  const den = parseInt(transport?.timeSignature?.[1], 10) || 4;
  return num * (den > 0 ? 4 / den : 1);
};

/** One quarter-note beat at the current BPM. */
export const beatSeconds = (transport) => 60 / (transport?.bpm ?? 120);

/** One notated bar from time signature (4/4 → four quarter-note beats). */
export const barSeconds = (transport) => beatSeconds(transport) * beatsPerBar(transport);

export const nextLocalBarTime = (transport, fromTime) => {
  const bar = barSeconds(transport);
  if (!bar) return nextTransportStart(fromTime);
  const barsElapsed = Math.floor(fromTime / bar);
  const next = (barsElapsed + 1) * bar;
  return next <= fromTime + 0.001 ? next + bar : next;
};

/** Next bar on the session grid (`startTime` from `state.transport`). */
export const nextBarTime = (transport, fromTime, startTime) => {
  const bar = barSeconds(transport);
  if (!startTime || fromTime < startTime) {
    return nextTransportStart(fromTime);
  }
  const barsElapsed = Math.floor((fromTime - startTime) / bar);
  return startTime + (barsElapsed + 1) * bar;
};

export const nextSlotCycleTime = (slotStartedAt, duration, fromTime) => {
  if (!slotStartedAt || !duration) return nextTransportStart(fromTime);
  const elapsed = fromTime - slotStartedAt;
  const cycles = Math.floor(elapsed / duration);
  return slotStartedAt + (cycles + 1) * duration;
};

export const phaseAt = (startedAt, duration, atTime) => {
  if (!startedAt || !duration) return 0;
  const elapsed = (((atTime - startedAt) % duration) + duration) % duration;
  return elapsed / duration;
};

/** Anchor session transport to a playing loop's `startedAt` (shared timeline). */
export const transportStartFromLoopPhase = (loopStartedAt, now) =>
  loopStartedAt || nextTransportStart(now);

/** Next bar boundary on a playing loop's timeline. */
export const nextLoopBarTime = (transport, loopStartedAt, loopDuration, fromTime) => {
  const bar = barSeconds(transport);
  if (!bar || !loopStartedAt || !loopDuration) return nextLocalBarTime(transport, fromTime);
  const elapsed = (((fromTime - loopStartedAt) % loopDuration) + loopDuration) % loopDuration;
  const intoBar = elapsed % bar;
  const remaining = intoBar < 0.001 ? bar : bar - intoBar;
  return fromTime + remaining;
};
