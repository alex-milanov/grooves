import { defaultPanels, isMobile } from './panels';
import { getLoopSlot, slotHasContent } from './loops-state';

export const panelsForSlotSelection = (state, slotIndex) => {
  const panels = state.ui?.loops?.panels ?? defaultPanels();
  if (slotHasContent(getLoopSlot(state, slotIndex))) {
    return { library: panels.library, settings: true };
  }
  return { library: true, settings: false };
};

const libraryForSlot = (state, slotIndex) => {
  const slot = getLoopSlot(state, slotIndex);
  if (!slot?.kit) {
    return {
      ...state.loopsLibrary,
      path: ['loops'],
      selectedSample: null,
    };
  }
  return {
    ...state.loopsLibrary,
    path: ['loops', slot.kit],
    selectedSample: slot.sample ?? null,
  };
};

export const selectLoopSlot = (state, slotIndex) => ({
  ...state,
  ui: {
    ...state.ui,
    loops: {
      ...state.ui.loops,
      selectedSlot: slotIndex,
      panels: panelsForSlotSelection(state, slotIndex),
    },
  },
  loopsLibrary: libraryForSlot(state, slotIndex),
});

export const deselectLoopSlot = (state) => ({
  ...state,
  ui: {
    ...state.ui,
    loops: {
      ...state.ui.loops,
      selectedSlot: null,
      panels: defaultPanels(),
    },
  },
});

export const openLoopLibraryPanel = (state, slotIndex) => {
  const wasSelected = state.ui?.loops?.selectedSlot === slotIndex;
  const panels = state.ui?.loops?.panels ?? defaultPanels();

  if (!wasSelected) {
    const hasContent = slotHasContent(getLoopSlot(state, slotIndex));
    return {
      ...state,
      ui: {
        ...state.ui,
        loops: {
          ...state.ui.loops,
          selectedSlot: slotIndex,
          panels: {
            library: true,
            settings: hasContent,
          },
        },
      },
      loopsLibrary: libraryForSlot(state, slotIndex),
    };
  }

  return {
    ...state,
    ui: {
      ...state.ui,
      loops: {
        ...state.ui.loops,
        panels: { ...panels, library: !panels.library },
      },
    },
  };
};

export const panelsAfterLoopAssign = (state) => {
  const mobile = isMobile(state);
  return {
    library: mobile ? false : (state.ui?.loops?.panels?.library ?? false),
    settings: true,
  };
};
