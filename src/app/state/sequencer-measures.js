/** Measure helpers — pattern events on tracks[drums].pattern.measures[bar][row][step]. */

import {
  getDrumsTrack,
  getDrumsPattern,
  drumsRowCount,
  mapDrumsTrack,
} from './drums';

export const MAX_BARS = 8;

export const stepsPerBar = (state) => {
  const [num, den] = state.transport?.timeSignature ?? [4, 4];
  const resolution = state.transport?.resolution ?? 16;
  return Number((resolution * (num / den)).toFixed(0));
};

/**
 * `obj.patch` through numeric keys turns arrays into array-likes with length 0.
 * Always coerce to a real Array before spread / length checks.
 */
export const measuresList = (state) => {
  const raw = getDrumsPattern(state)?.measures;
  if (Array.isArray(raw) && raw.length > 0) return raw;
  if (Array.isArray(raw) && raw.length === 0) {
    const keys = Object.keys(raw)
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (keys.length) return keys.map((k) => raw[k] ?? {});
  }
  if (raw && typeof raw === 'object') {
    const keys = Object.keys(raw)
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (keys.length) return keys.map((k) => raw[k] ?? {});
  }
  return [{}];
};

export const barCount = (state) => Math.max(1, measuresList(state).length);

/** One schedule cycle = one bar. */
export const totalSteps = (state) => stepsPerBar(state);

export const measureStepOn = (state, bar, row, step) =>
  !!measuresList(state)[bar]?.[row]?.[step];

const clampBar = (state, bar) =>
  Math.max(0, Math.min(barCount(state) - 1, Number(bar) || 0));

const cloneMeasure = (m) =>
  Object.fromEntries(Object.entries(m ?? {}).map(([r, steps]) => [r, { ...steps }]));

const patchPatternMeasures = (state, measures) =>
  mapDrumsTrack(state, (t) => ({
    ...t,
    pattern: {
      ...t.pattern,
      steps: stepsPerBar(state),
      measures,
    },
  }));

const drumsUi = (state) => state.ui?.drums ?? {};

const patchDrumsUi = (state, patch) => ({
  ...state,
  ui: {
    ...state.ui,
    drums: { ...drumsUi(state), ...patch },
  },
});

/** Toggle a local step — do not use obj.patch on measures[] (breaks array length). */
export const toggleMeasureStep = (bar, row, step) => (state) => {
  const measures = measuresList(state).map(cloneMeasure);
  const b = clampBar(state, bar);
  const measure = measures[b] ?? {};
  const rowSteps = { ...(measure[row] ?? {}) };
  if (rowSteps[step]) delete rowSteps[step];
  else rowSteps[step] = true;
  measures[b] = { ...measure, [row]: rowSteps };
  return patchPatternMeasures(state, measures);
};

/** Append a bar by copying currentBar; select the new bar. */
export const addBar = (state) => {
  const measures = measuresList(state).map(cloneMeasure);
  if (measures.length >= MAX_BARS) return state;
  const source = clampBar(state, drumsUi(state).currentBar ?? 0);
  measures.push(cloneMeasure(measures[source] ?? {}));
  return patchDrumsUi(patchPatternMeasures(state, measures), {
    currentBar: measures.length - 1,
    cuedBar: null,
    deleteArmedBar: null,
  });
};

/** Remove one bar (keeps at least one). */
export const removeBar = (barIndex) => (state) => {
  const measures = measuresList(state).map(cloneMeasure);
  if (measures.length <= 1) return state;
  const bar = clampBar(state, barIndex);
  measures.splice(bar, 1);

  let currentBar = drumsUi(state).currentBar ?? 0;
  if (currentBar === bar) currentBar = Math.min(bar, measures.length - 1);
  else if (currentBar > bar) currentBar -= 1;

  let cuedBar = drumsUi(state).cuedBar;
  if (cuedBar === bar) cuedBar = null;
  else if (cuedBar != null && cuedBar > bar) cuedBar -= 1;

  return patchDrumsUi(patchPatternMeasures(state, measures), {
    currentBar: Math.max(0, Math.min(measures.length - 1, currentBar)),
    cuedBar,
    deleteArmedBar: null,
  });
};

export const setCurrentBar = (bar) => (state) => {
  const currentBar = clampBar(state, bar);
  const ui = drumsUi(state);
  if (currentBar === (ui.currentBar ?? 0) && ui.cuedBar == null) return state;
  return patchDrumsUi(state, { currentBar, cuedBar: null });
};

export const setCuedBar = (bar) => (state) => {
  const cuedBar = clampBar(state, bar);
  if (cuedBar === drumsUi(state).cuedBar) {
    return patchDrumsUi(state, { cuedBar: null });
  }
  return patchDrumsUi(state, { cuedBar });
};

export const clearCuedBar = (state) =>
  drumsUi(state).cuedBar == null ? state : patchDrumsUi(state, { cuedBar: null });

/** Strip click: select when stopped; cue-next when playing (hold currentBar). */
export const selectMeasure = (bar, playing, fromBar = 0) => (state) => {
  if (!playing) {
    const next = setCurrentBar(bar)(state);
    return drumsUi(next).deleteArmedBar == null
      ? next
      : patchDrumsUi(next, { deleteArmedBar: null });
  }
  const cuedBar = clampBar(state, bar);
  if (cuedBar === drumsUi(state).cuedBar) {
    return patchDrumsUi(state, { cuedBar: null, deleteArmedBar: null });
  }
  return patchDrumsUi(state, {
    cuedBar,
    currentBar: clampBar(state, fromBar),
    deleteArmedBar: null,
  });
};

export const toggleMeasuresExpanded = (state) =>
  patchDrumsUi(state, {
    measuresExpanded: !drumsUi(state).measuresExpanded,
  });

export const armDeleteBar = (bar) => (state) => {
  if (barCount(state) <= 1) return state;
  const deleteArmedBar = clampBar(state, bar);
  if (deleteArmedBar === drumsUi(state).deleteArmedBar) return state;
  return patchDrumsUi(state, { deleteArmedBar });
};

export const clearDeleteArmedBar = (state) =>
  drumsUi(state).deleteArmedBar == null
    ? state
    : patchDrumsUi(state, { deleteArmedBar: null });

export { getDrumsTrack, drumsRowCount };