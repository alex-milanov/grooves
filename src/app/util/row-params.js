export const DEFAULT_ROW_PARAMS = {
  volume: 0.85,
  muted: false,
  vcf: { cutoff: 0.64, resonance: 0 },
  sends: { reverb: 0, delay: 0 },
};

export const getRowParams = (rowParams, row) => {
  const raw = rowParams?.[row] ?? {};
  return {
    ...DEFAULT_ROW_PARAMS,
    ...raw,
    vcf: { ...DEFAULT_ROW_PARAMS.vcf, ...raw.vcf },
    sends: { ...DEFAULT_ROW_PARAMS.sends, ...raw.sends },
  };
};

export const rowGain = (rowParams, row) => {
  const params = getRowParams(rowParams, row);
  if (params.muted) return 0;
  return params.volume;
};
