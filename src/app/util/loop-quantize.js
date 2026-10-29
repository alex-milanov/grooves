/** Fraction of a bar treated as near a cycle edge (one eighth / one beat in 4/4). */
export const CYCLE_EDGE = 0.125;

export const quantizeBarCount = (rawSeconds, barSeconds) => {
  if (
    !Number.isFinite(rawSeconds) ||
    rawSeconds <= 0 ||
    !Number.isFinite(barSeconds) ||
    barSeconds <= 0
  ) {
    return 1;
  }
  if (rawSeconds < barSeconds) return 1;

  const fullBars = Math.floor(rawSeconds / barSeconds);
  const remainder = rawSeconds - fullBars * barSeconds;
  const fraction = remainder / barSeconds;

  // End within the first 1/8 of the next bar → cut; otherwise pad out the bar.
  if (fraction < CYCLE_EDGE) return Math.max(1, fullBars);
  return fullBars + 1;
};

export const quantizeTargetSeconds = (rawSeconds, barSeconds) => {
  const bar = Number(barSeconds);
  if (!Number.isFinite(bar) || bar <= 0) {
    const raw = Number(rawSeconds);
    return Number.isFinite(raw) && raw > 0 ? raw : 0.1;
  }
  return quantizeBarCount(rawSeconds, bar) * bar;
};

/**
 * Live first-take length while recording: 1 bar, then 2, 3, … as elapsed crosses
 * each bar boundary (same idea as post-take quantize, without the edge cut).
 */
export const growingRecordBars = (elapsedSeconds, barSec) => {
  if (!Number.isFinite(barSec) || barSec <= 0) return 1;
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  return Math.max(1, Math.ceil(elapsed / barSec) || 1);
};

export const growingRecordCycleSeconds = (elapsedSeconds, barSec) =>
  growingRecordBars(elapsedSeconds, barSec) * barSec;

/** 0–100 progress through the current growing bar scope (no wrap). */
export const growingRecordProgress = (startedAt, barSec, atTime) => {
  if (startedAt == null || !Number.isFinite(barSec) || barSec <= 0) return 0;
  const elapsed = Math.max(0, atTime - startedAt);
  const cycle = growingRecordCycleSeconds(elapsed, barSec);
  if (!cycle) return 0;
  return Math.min(100, (elapsed / cycle) * 100);
};

/** Seconds of near-silence at the start of a buffer (MediaRecorder preroll, etc.). */
export const leadingSilenceSeconds = (
  buffer,
  { threshold = 0.02, maxSeconds = 0.12 } = {},
) => {
  if (!buffer?.length) return 0;
  const { sampleRate, numberOfChannels, length } = buffer;
  const maxSamples = Math.min(length, Math.max(0, Math.round(maxSeconds * sampleRate)));
  if (maxSamples === 0) return 0;

  for (let i = 0; i < maxSamples; i++) {
    for (let ch = 0; ch < numberOfChannels; ch++) {
      if (Math.abs(buffer.getChannelData(ch)[i]) >= threshold) {
        return i / sampleRate;
      }
    }
  }
  return maxSamples / sampleRate;
};

/**
 * Fit buffer to targetSeconds: optional leading silence, then audio (after skipSeconds),
 * then trailing silence or trim.
 */
export const trimPadBuffer = (ctx, buffer, targetSeconds, leadPadSeconds = 0, skipSeconds = 0) => {
  const sampleRate = buffer.sampleRate;
  if (!sampleRate || !Number.isFinite(sampleRate)) {
    throw new Error('trimPadBuffer: invalid sampleRate');
  }
  const targetLength = Math.max(
    1,
    Math.round((Number.isFinite(targetSeconds) ? targetSeconds : 0) * sampleRate) || 1,
  );
  const leadSamples = Math.max(0, Math.min(targetLength, Math.round(leadPadSeconds * sampleRate)));
  const skipSamples = Math.max(0, Math.min(buffer.length, Math.round(skipSeconds * sampleRate)));
  const channels = Math.max(1, buffer.numberOfChannels || 1);
  const out = ctx.createBuffer(channels, targetLength, sampleRate);

  for (let ch = 0; ch < channels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    const available = buffer.length - skipSamples;
    const copyLen = Math.min(available, targetLength - leadSamples);
    if (copyLen > 0) dst.set(src.subarray(skipSamples, skipSamples + copyLen), leadSamples);
  }

  return out;
};
