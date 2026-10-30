/** Measure / multi-bar helpers for the drums sequencer. */

export const MAX_BARS = 8;

/** Steps in one bar from transport signature × resolution. */
export const stepsPerBar = (state) => {
  const [num, den] = state.transport?.timeSignature ?? [4, 4];
  const resolution = state.transport?.resolution ?? 16;
  return Number((resolution * (num / den)).toFixed(0));
};

export const barCount = (state) => Math.max(1, state.sequencer?.bars ?? 1);

export const totalSteps = (state) => stepsPerBar(state) * barCount(state);

const copyLastBarGrid = (grid, rowCount, perBar, bars) => {
  // Rows are sparse objects from obj.patch (not arrays).
  const lastStart = (bars - 1) * perBar;
  const next = { ...(grid ?? {}) };
  for (let r = 0; r < rowCount; r++) {
    const prev = grid?.[r] ?? {};
    const row = { ...prev };
    for (let i = 0; i < perBar; i++) {
      row[lastStart + perBar + i] = !!prev[lastStart + i];
    }
    next[r] = row;
  }
  return next;
};

const clampBar = (state, bar) => {
  const bars = barCount(state);
  return Math.max(0, Math.min(bars - 1, Number(bar) || 0));
};

/** Append a bar by copying the last bar’s pattern on every row. */
export const addBar = (state) => {
  const bars = barCount(state);
  if (bars >= MAX_BARS) return state;

  const perBar = stepsPerBar(state);
  const rowCount = state.sequencer.rows ?? 0;
  const nextBars = bars + 1;

  return {
    ...state,
    sequencer: {
      ...state.sequencer,
      bars: nextBars,
      steps: perBar * nextBars,
      focusedBar: bars,
      cuedBar: null,
      deleteArmedBar: null,
      grid: copyLastBarGrid(state.sequencer.grid, rowCount, perBar, bars),
    },
  };
};

const removeBarFromGrid = (grid, rowCount, perBar, barIndex) => {
  const start = barIndex * perBar;
  const end = start + perBar;
  const next = { ...(grid ?? {}) };
  for (let r = 0; r < rowCount; r++) {
    const prev = grid?.[r] ?? {};
    const row = {};
    for (const key of Object.keys(prev)) {
      const step = Number(key);
      if (!Number.isFinite(step)) continue;
      if (step >= start && step < end) continue;
      row[step >= end ? step - perBar : step] = !!prev[step];
    }
    next[r] = row;
  }
  return next;
};

/** Remove one bar (keeps at least one). Shifts later bars down. */
export const removeBar = (barIndex) => (state) => {
  const bars = barCount(state);
  if (bars <= 1) return state;

  const bar = clampBar(state, barIndex);
  const perBar = stepsPerBar(state);
  const rowCount = state.sequencer.rows ?? 0;
  const nextBars = bars - 1;

  let focusedBar = state.sequencer.focusedBar ?? 0;
  if (focusedBar === bar) focusedBar = Math.min(bar, nextBars - 1);
  else if (focusedBar > bar) focusedBar -= 1;

  let cuedBar = state.sequencer.cuedBar;
  if (cuedBar != null) {
    if (cuedBar === bar) cuedBar = null;
    else if (cuedBar > bar) cuedBar -= 1;
  }

  return {
    ...state,
    sequencer: {
      ...state.sequencer,
      bars: nextBars,
      steps: perBar * nextBars,
      focusedBar: Math.max(0, Math.min(nextBars - 1, focusedBar)),
      cuedBar,
      deleteArmedBar: null,
      grid: removeBarFromGrid(state.sequencer.grid, rowCount, perBar, bar),
    },
  };
};

/** Stopped: jump edit focus to this bar. */
export const setFocusedBar = (bar) => (state) => {
  const focusedBar = clampBar(state, bar);
  if (
    focusedBar === (state.sequencer.focusedBar ?? 0) &&
    state.sequencer.cuedBar == null
  ) {
    return state;
  }
  return {
    ...state,
    sequencer: { ...state.sequencer, focusedBar, cuedBar: null },
  };
};

/** Playing: arm this bar as the next one after the current bar ends. */
export const setCuedBar = (bar) => (state) => {
  const cuedBar = clampBar(state, bar);
  if (cuedBar === state.sequencer.cuedBar) {
    return {
      ...state,
      sequencer: { ...state.sequencer, cuedBar: null },
    };
  }
  return {
    ...state,
    sequencer: { ...state.sequencer, cuedBar },
  };
};

export const clearCuedBar = (state) => {
  if (state.sequencer.cuedBar == null) return state;
  return {
    ...state,
    sequencer: { ...state.sequencer, cuedBar: null },
  };
};

/**
 * Strip click: direct switch when stopped; cue-next when playing.
 * `currentBar` is the bar currently shown/playing — kept as focusedBar so the
 * UI can stay on it until the cue lands (no flash of the natural next bar).
 */
export const selectMeasure = (bar, playing, currentBar = 0) => (state) => {
  if (!playing) {
    const next = setFocusedBar(bar)(state);
    if (next.sequencer.deleteArmedBar == null) return next;
    return {
      ...next,
      sequencer: { ...next.sequencer, deleteArmedBar: null },
    };
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
  const bars = barCount(state);
  if (bars <= 1) return state;
  const deleteArmedBar = clampBar(state, bar);
  if (deleteArmedBar === state.sequencer.deleteArmedBar) return state;
  return {
    ...state,
    sequencer: { ...state.sequencer, deleteArmedBar },
  };
};

export const clearDeleteArmedBar = (state) => {
  if (state.sequencer.deleteArmedBar == null) return state;
  return {
    ...state,
    sequencer: { ...state.sequencer, deleteArmedBar: null },
  };
};
