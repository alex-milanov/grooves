/** Fraction of a bar treated as near a cycle edge (one eighth / one beat in 4/4). */
export const CYCLE_EDGE = 0.125;

export const quantizeBarCount = (rawSeconds, barSeconds) => {
  if (rawSeconds <= 0 || barSeconds <= 0) return 1;
  if (rawSeconds < barSeconds) return 1;

  const fullBars = Math.floor(rawSeconds / barSeconds);
  const remainder = rawSeconds - fullBars * barSeconds;
  const fraction = remainder / barSeconds;

  // End within the first 1/8 of the next bar → cut; otherwise pad out the bar.
  if (fraction < CYCLE_EDGE) return Math.max(1, fullBars);
  return fullBars + 1;
};

export const quantizeTargetSeconds = (rawSeconds, barSeconds) =>
  quantizeBarCount(rawSeconds, barSeconds) * barSeconds;

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
  const targetLength = Math.max(1, Math.round(targetSeconds * sampleRate));
  const leadSamples = Math.max(0, Math.min(targetLength, Math.round(leadPadSeconds * sampleRate)));
  const skipSamples = Math.max(0, Math.min(buffer.length, Math.round(skipSeconds * sampleRate)));
  const channels = buffer.numberOfChannels;
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
