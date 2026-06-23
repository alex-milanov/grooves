export const DEFAULT_TRACK_PARAMS = {
  volume: 0.85,
  muted: false,
  vcf: { cutoff: 0.64, resonance: 0 },
  sends: { reverb: 0, delay: 0 },
};

export const getTrackParams = (trackParams, track) => {
  const raw = trackParams?.[track] ?? {};
  return {
    ...DEFAULT_TRACK_PARAMS,
    ...raw,
    vcf: { ...DEFAULT_TRACK_PARAMS.vcf, ...raw.vcf },
    sends: { ...DEFAULT_TRACK_PARAMS.sends, ...raw.sends },
  };
};

export const trackGain = (trackParams, track) => {
  const params = getTrackParams(trackParams, track);
  if (params.muted) return 0;
  return params.volume;
};
