export const quantizeBarCount = (rawSeconds, barSeconds) => {
  if (rawSeconds <= 0 || barSeconds <= 0) return 1;
  if (rawSeconds < barSeconds) return 1;

  const fullBars = Math.floor(rawSeconds / barSeconds);
  const remainder = rawSeconds - fullBars * barSeconds;
  const fraction = remainder / barSeconds;

  if (fraction < 0.5) return Math.max(1, fullBars);
  return fullBars + 1;
};

export const quantizeTargetSeconds = (rawSeconds, barSeconds) =>
  quantizeBarCount(rawSeconds, barSeconds) * barSeconds;

export const trimPadBuffer = (ctx, buffer, targetSeconds) => {
  const sampleRate = buffer.sampleRate;
  const targetLength = Math.max(1, Math.round(targetSeconds * sampleRate));
  const channels = buffer.numberOfChannels;
  const out = ctx.createBuffer(channels, targetLength, sampleRate);

  for (let ch = 0; ch < channels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    const copyLen = Math.min(src.length, targetLength);
    dst.set(src.subarray(0, copyLen));
  }

  return out;
};
