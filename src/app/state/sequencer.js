import { defaultPanels, isMobile } from '../util/panels';
import { ensureLibrarySection, libraryForAssignment, SAMPLES_SECTION } from '../util/library';
import {
  assignDrumRowSample,
  getDrumRow,
  getDrumsRows,
  hasRowSample,
  rowSample,
  setDrumsRowCount,
} from './drums';

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
  setCurrentBar,
  setCuedBar,
  clearCuedBar,
  selectMeasure,
  toggleMeasuresExpanded,
  armDeleteBar,
  clearDeleteArmedBar,
} from './sequencer-measures';

const drumsUi = (state) => state.ui?.drums ?? {};

const patchDrumsUi = (state, patch) => ({
  ...state,
  ui: {
    ...state.ui,
    drums: { ...drumsUi(state), ...patch },
  },
});

export const hasAssignment = (state, row) => hasRowSample(getDrumRow(state, row));

export const panelsForSelection = (state, row) => {
  const panels = drumsUi(state).panels ?? defaultPanels();
  if (hasRowSample(getDrumRow(state, row))) {
    return { library: panels.library, settings: true };
  }
  return { library: true, settings: false };
};

const librarySelectionForRow = (state, row) =>
  libraryForAssignment(state.library, SAMPLES_SECTION, rowSample(getDrumRow(state, row)));

export const selectRow = (row) => (state) => ({
  ...patchDrumsUi(state, {
    selectedRow: row,
    panels: panelsForSelection(state, row),
  }),
  library: librarySelectionForRow(state, row),
});

export const deselectRow = (state) =>
  patchDrumsUi(state, {
    selectedRow: null,
    panels: defaultPanels(),
  });

export const togglePanel = (panel) => (state) => {
  const mobile = isMobile(state);
  const panels = drumsUi(state).panels ?? defaultPanels();
  const next = !panels[panel];
  const updated = { ...panels, [panel]: next };

  if (mobile && next) {
    if (panel === 'library') updated.settings = false;
    if (panel === 'settings') updated.library = false;
  }

  return patchDrumsUi(state, { panels: updated });
};

export const openLibraryPanel = (row) => (state) => {
  const ui = drumsUi(state);
  const wasSelected = ui.selectedRow === row;
  const panels = ui.panels ?? defaultPanels();

  if (!wasSelected) {
    const assigned = hasRowSample(getDrumRow(state, row));
    return {
      ...patchDrumsUi(state, {
        selectedRow: row,
        panels: { library: true, settings: assigned },
      }),
      library: ensureLibrarySection(librarySelectionForRow(state, row), SAMPLES_SECTION),
    };
  }

  const nextLibrary = panels.library
    ? state.library
    : ensureLibrarySection(librarySelectionForRow(state, row), SAMPLES_SECTION);

  return {
    ...patchDrumsUi(state, {
      panels: { ...panels, library: !panels.library },
    }),
    library: nextLibrary,
  };
};

export const panelsAfterAssign = (state) => {
  const mobile = isMobile(state);
  return {
    library: mobile ? false : (drumsUi(state).panels?.library ?? false),
    settings: true,
  };
};

/** Assign a kit sample to a drum row. */
export const assignRowSample = (row, kit, sample) => (state) => {
  const withSample = assignDrumRowSample(row, kit, sample)(state);
  return {
    ...patchDrumsUi(withSample, { panels: panelsAfterAssign(withSample) }),
    library: {
      ...withSample.library,
      selectedSample: sample,
    },
  };
};

export const setRowCount = (count) => (state) => {
  const next = setDrumsRowCount(count)(state);
  const rows = getDrumsRows(next);
  const selected = drumsUi(next).selectedRow;
  if (selected != null && selected >= rows.length) {
    return patchDrumsUi(next, { selectedRow: rows.length - 1 });
  }
  return next;
};
