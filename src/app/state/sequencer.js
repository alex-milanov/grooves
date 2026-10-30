import { defaultPanels, isMobile } from '../util/panels';
import { ensureLibrarySection, libraryForAssignment, SAMPLES_SECTION } from '../util/library';

export {
  MAX_BARS,
  stepsPerBar,
  barCount,
  totalSteps,
  measuresList,
  measureStepOn,
  toggleMeasureStep,
  addBar,
  removeBar,
  setFocusedBar,
  setCuedBar,
  clearCuedBar,
  selectMeasure,
  toggleMeasuresExpanded,
  armDeleteBar,
  clearDeleteArmedBar,
} from './sequencer-measures';

export const hasAssignment = (assignments, row) => {
  const a = assignments?.[row];
  return !!(a?.kit && a?.sample);
};

/** Single-click select: keep library open; open settings when assigned. */
export const panelsForSelection = (state, row) => {
  const panels = state.sequencer.panels ?? defaultPanels();
  if (hasAssignment(state.sequencer.assignments, row)) {
    return { library: panels.library, settings: true };
  }
  return { library: true, settings: false };
};

/** Jump library to this row's assigned kit/sample (sticky if unassigned). */
const librarySelectionForRow = (state, row) =>
  libraryForAssignment(state.library, SAMPLES_SECTION, state.sequencer.assignments?.[row]);

export const selectRow = (row) => (state) => ({
  ...state,
  sequencer: {
    ...state.sequencer,
    selectedRow: row,
    panels: panelsForSelection(state, row),
  },
  library: librarySelectionForRow(state, row),
});

export const deselectRow = (state) => ({
  ...state,
  sequencer: {
    ...state.sequencer,
    selectedRow: null,
    panels: defaultPanels(),
  },
});

export const togglePanel = (panel) => (state) => {
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

export const openLibraryPanel = (row) => (state) => {
  const wasSelected = state.sequencer.selectedRow === row;
  const panels = state.sequencer.panels ?? defaultPanels();

  if (!wasSelected) {
    const assigned = hasAssignment(state.sequencer.assignments, row);
    return {
      ...state,
      sequencer: {
        ...state.sequencer,
        selectedRow: row,
        panels: {
          library: true,
          settings: assigned,
        },
      },
      library: ensureLibrarySection(librarySelectionForRow(state, row), SAMPLES_SECTION),
    };
  }

  const nextLibrary = panels.library
    ? state.library
    : ensureLibrarySection(librarySelectionForRow(state, row), SAMPLES_SECTION);

  return {
    ...state,
    sequencer: {
      ...state.sequencer,
      panels: { ...panels, library: !panels.library },
    },
    library: nextLibrary,
  };
};

export const panelsAfterAssign = (state) => {
  const mobile = isMobile(state);
  return {
    library: mobile ? false : (state.sequencer.panels?.library ?? false),
    settings: true,
  };
};

/** Assign a kit sample to a drum row — stores a reference; playback reads the library buffer. */
export const assignRowSample = (row, kit, sample) => (state) => ({
  ...state,
  sequencer: {
    ...state.sequencer,
    assignments: {
      ...state.sequencer.assignments,
      [row]: { kit, sample },
    },
    panels: panelsAfterAssign(state),
  },
  library: {
    ...state.library,
    selectedSample: sample,
  },
});
