/** Assumed BPM for library loops and legacy slots without sourceBpm. */
export const DEFAULT_LOOP_SOURCE_BPM = 120;

export const loopPlaybackRate = (sourceBpm, transport) => {
  const current = transport?.bpm ?? DEFAULT_LOOP_SOURCE_BPM;
  const source = sourceBpm ?? DEFAULT_LOOP_SOURCE_BPM;
  if (!source) return 1;
  return current / source;
};

/** Audible loop length after tempo stretch (source buffer unchanged). */
export const loopPlaybackDuration = (sourceDuration, sourceBpm, transport) => {
  if (!sourceDuration) return 0;
  const rate = loopPlaybackRate(sourceBpm, transport);
  if (!rate) return sourceDuration;
  return sourceDuration / rate;
};

export const slotSourceBpm = (slot, layerIndex = 0) =>
  slot?.sourceBpms?.[layerIndex] ?? slot?.sourceBpm ?? DEFAULT_LOOP_SOURCE_BPM;

export const slotPlaybackFromBuffer = (buffer, slot, transport, layerIndex = 0) => {
  if (!buffer) return { rate: 1, duration: slot?.duration ?? 0 };
  const sourceBpm = slotSourceBpm(slot, layerIndex);
  const rate = loopPlaybackRate(sourceBpm, transport);
  const duration = loopPlaybackDuration(buffer.duration, sourceBpm, transport);
  return { rate, duration, sourceBpm, sourceDuration: buffer.duration };
};

export const slotPlaybackPatch = (slot, transport, buffer) => {
  if (!buffer || !slot?.bufferKeys?.length) return null;
  const { duration } = slotPlaybackFromBuffer(buffer, slot, transport);
  if (duration === slot.duration) return null;
  return { duration };
};
