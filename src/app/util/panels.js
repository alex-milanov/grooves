export const MOBILE_BREAKPOINT = 900;

export const isMobile = state =>
  (state.viewport?.screen?.width ?? window.innerWidth) < MOBILE_BREAKPOINT;

export const defaultPanels = () => ({ library: false, settings: false });

export const hasAssignment = (assignments, track) => {
  const a = assignments?.[track];
  return !!(a?.kit && a?.sample);
};

/** Single-click select: keep library open; open settings when assigned. */
export const panelsForSelection = (state, track) => {
  const panels = state.sequencer.panels ?? defaultPanels();
  if (hasAssignment(state.sequencer.assignments, track)) {
    return { library: panels.library, settings: true };
  }
  return { library: true, settings: false };
};

export const selectTrack = (state, track) => ({
  ...state,
  sequencer: {
    ...state.sequencer,
    selectedTrack: track,
    panels: panelsForSelection(state, track),
  },
  library: libraryForTrack(state, track),
});

const libraryForTrack = (state, track) => {
  if (!hasAssignment(state.sequencer.assignments, track)) {
    return {
      ...state.library,
      path: ['library'],
      selectedSample: null,
    };
  }
  const { kit, sample } = state.sequencer.assignments[track];
  return {
    ...state.library,
    path: ['library', kit],
    selectedSample: sample,
  };
};

export const deselectTrack = state => ({
  ...state,
  sequencer: {
    ...state.sequencer,
    selectedTrack: null,
    panels: defaultPanels(),
  },
});

export const togglePanel = (state, panel) => {
  const mobile = isMobile(state);
  const panels = state.sequencer.panels ?? defaultPanels();
  const next = !panels[panel];
  const updated = { ...panels, [panel]: next };

  if (mobile && next) {
    if (panel === 'library') updated.settings = false;
    if (panel === 'settings') updated.library = false;
  }

  return {
    ...state,
    sequencer: {
      ...state.sequencer,
      panels: updated,
    },
  };
};

export const openLibraryPanel = (state, track) => {
  const wasSelected = state.sequencer.selectedTrack === track;
  const panels = state.sequencer.panels ?? defaultPanels();

  if (!wasSelected) {
    const assigned = hasAssignment(state.sequencer.assignments, track);
    return {
      ...state,
      sequencer: {
        ...state.sequencer,
        selectedTrack: track,
        panels: {
          library: true,
          settings: assigned,
        },
      },
      library: libraryForTrack(state, track),
    };
  }

  return {
    ...state,
    sequencer: {
      ...state.sequencer,
      panels: { ...panels, library: !panels.library },
    },
  };
};

export const panelsAfterAssign = state => {
  const mobile = isMobile(state);
  return {
    library: mobile ? false : (state.sequencer.panels?.library ?? false),
    settings: true,
  };
};
