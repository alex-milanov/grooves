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

export const barSeconds = (transport) => {
  const resolution = transport?.resolution ?? 16;
  const [num, den] = transport?.timeSignature ?? [4, 4];
  const bpm = transport?.bpm ?? 120;
  return stepTime(bpm) * resolution * (num / den);
};

export const beatSeconds = (transport) => {
  const [num] = transport?.timeSignature ?? [4, 4];
  const bar = barSeconds(transport);
  return num > 0 ? bar / num : bar / 4;
};

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
  return ((atTime - startedAt) % duration) / duration;
};
