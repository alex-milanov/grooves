/** Amplitude multiplier from gain in dB (0 dB → 1). */
export const dbToLinear = (db) => 10 ** (db / 20);

/** Gain in dB from linear amplitude (1 → 0 dB). */
export const linearToDb = (linear) => 20 * Math.log10(Math.max(linear, Number.EPSILON));
