/** Measure helpers — pattern events grouped per bar (`measures[bar][row][step]`). */

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
  const raw = state.sequencer?.measures;
  if (Array.isArray(raw) && raw.length > 0) return raw;
  if (Array.isArray(raw) && raw.length === 0) {
    // Patch-corrupted: indices present, length missing/0 — recover by keys.
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
  const bars = Math.max(1, state.sequencer?.bars ?? 1);
  return Array.from({ length: bars }, () => ({}));
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

/** Toggle a local step — do not use obj.patch on measures[] (breaks array length). */
export const toggleMeasureStep = (bar, row, step) => (state) => {
  const measures = measuresList(state).map(cloneMeasure);
  const b = clampBar(state, bar);
  const measure = measures[b] ?? {};
  const rowSteps = { ...(measure[row] ?? {}) };
  if (rowSteps[step]) delete rowSteps[step];
  else rowSteps[step] = true;
  measures[b] = { ...measure, [row]: rowSteps };
  return {
    ...state,
    sequencer: {
      ...state.sequencer,
      bars: measures.length,
      measures,
    },
  };
};

/** Append a bar by copying the last measure. */
export const addBar = (state) => {
  const measures = measuresList(state).map(cloneMeasure);
  if (measures.length >= MAX_BARS) return state;
  measures.push(cloneMeasure(measures[measures.length - 1] ?? {}));
  return {
    ...state,
    sequencer: {
      ...state.sequencer,
      bars: measures.length,
      steps: stepsPerBar(state),
      focusedBar: measures.length - 1,
      cuedBar: null,
      deleteArmedBar: null,
      measures,
    },
  };
};

/** Remove one bar (keeps at least one). */
export const removeBar = (barIndex) => (state) => {
  const measures = measuresList(state).map(cloneMeasure);
  if (measures.length <= 1) return state;
  const bar = clampBar(state, barIndex);
  measures.splice(bar, 1);

  let focusedBar = state.sequencer.focusedBar ?? 0;
  if (focusedBar === bar) focusedBar = Math.min(bar, measures.length - 1);
  else if (focusedBar > bar) focusedBar -= 1;

  let cuedBar = state.sequencer.cuedBar;
  if (cuedBar === bar) cuedBar = null;
  else if (cuedBar != null && cuedBar > bar) cuedBar -= 1;

  return {
    ...state,
    sequencer: {
      ...state.sequencer,
      bars: measures.length,
      steps: stepsPerBar(state),
      focusedBar: Math.max(0, Math.min(measures.length - 1, focusedBar)),
      cuedBar,
      deleteArmedBar: null,
      measures,
    },
  };
};

export const setFocusedBar = (bar) => (state) => {
  const focusedBar = clampBar(state, bar);
  if (focusedBar === (state.sequencer.focusedBar ?? 0) && state.sequencer.cuedBar == null) {
    return state;
  }
  return {
    ...state,
    sequencer: { ...state.sequencer, focusedBar, cuedBar: null },
  };
};

export const setCuedBar = (bar) => (state) => {
  const cuedBar = clampBar(state, bar);
  if (cuedBar === state.sequencer.cuedBar) {
    return { ...state, sequencer: { ...state.sequencer, cuedBar: null } };
  }
  return { ...state, sequencer: { ...state.sequencer, cuedBar } };
};

export const clearCuedBar = (state) =>
  state.sequencer.cuedBar == null
    ? state
    : { ...state, sequencer: { ...state.sequencer, cuedBar: null } };

/** Strip click: focus when stopped; cue-next when playing. */
export const selectMeasure = (bar, playing, currentBar = 0) => (state) => {
  if (!playing) {
    const next = setFocusedBar(bar)(state);
    return next.sequencer.deleteArmedBar == null
      ? next
      : { ...next, sequencer: { ...next.sequencer, deleteArmedBar: null } };
  }
  const cuedBar = clampBar(state, bar);
  if (cuedBar === state.sequencer.cuedBar) {
    return {
      ...state,
      sequencer: { ...state.sequencer, cuedBar: null, deleteArmedBar: null },
    };
  }
  return {
    ...state,
    sequencer: {
      ...state.sequencer,
      cuedBar,
      focusedBar: clampBar(state, currentBar),
      deleteArmedBar: null,
    },
  };
};

export const toggleMeasuresExpanded = (state) => ({
  ...state,
  sequencer: {
    ...state.sequencer,
    measuresExpanded: !state.sequencer.measuresExpanded,
  },
});

export const armDeleteBar = (bar) => (state) => {
  if (barCount(state) <= 1) return state;
  const deleteArmedBar = clampBar(state, bar);
  if (deleteArmedBar === state.sequencer.deleteArmedBar) return state;
  return { ...state, sequencer: { ...state.sequencer, deleteArmedBar } };
};

export const clearDeleteArmedBar = (state) =>
  state.sequencer.deleteArmedBar == null
    ? state
    : { ...state, sequencer: { ...state.sequencer, deleteArmedBar: null } };

/** Legacy flat `grid[row][absStep]` → `measures[bar][row][localStep]`. */
export const migrateFlatGridToMeasures = (sequencer, transport) => {
  if (!sequencer || (Array.isArray(sequencer.measures) && sequencer.measures.length)) {
    return sequencer?.measures
      ? { ...sequencer, bars: sequencer.measures.length }
      : sequencer;
  }
  const [num, den] = transport?.timeSignature ?? [4, 4];
  const perBar = Number((((transport?.resolution ?? 16) * num) / den).toFixed(0));
  const bars = Math.max(1, sequencer.bars ?? 1);
  const rows = sequencer.rows ?? sequencer.tracks ?? 4;
  const grid = sequencer.grid ?? {};
  const measures = Array.from({ length: bars }, () => ({}));
  for (let row = 0; row < rows; row++) {
    for (const [key, on] of Object.entries(grid[row] ?? {})) {
      if (!on) continue;
      const abs = Number(key);
      if (!Number.isFinite(abs)) continue;
      const bar = Math.floor(abs / perBar);
      if (bar < 0 || bar >= bars) continue;
      (measures[bar][row] ??= {})[abs % perBar] = true;
    }
  }
  const { grid: _g, ...rest } = sequencer;
  return { ...rest, bars, steps: perBar, measures };
};
