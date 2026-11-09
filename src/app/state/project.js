import { applyProjectDocument } from '../util/project/document';
import { defaultProjectName } from '../util/project/name';

/** Apply a parsed grooves-project document to state. */
export const loadProject = (doc) => applyProjectDocument(doc);

export const setProjectName = (name) => (state) => ({
  ...state,
  name: name == null ? null : String(name),
});

export const openSaveDialog = (formatId) => (state) => {
  const existing = state.name != null ? String(state.name).trim() : '';
  return {
    ...state,
    ui: {
      ...state.ui,
      saveDialog: {
        formatId,
        name: existing || defaultProjectName(),
      },
    },
  };
};

export const patchSaveDialogName = (name) => (state) => {
  if (!state.ui?.saveDialog) return state;
  return {
    ...state,
    ui: {
      ...state.ui,
      saveDialog: { ...state.ui.saveDialog, name },
    },
  };
};

export const closeSaveDialog = (state) => {
  if (state.ui?.saveDialog == null) return state;
  return {
    ...state,
    ui: { ...state.ui, saveDialog: null },
  };
};

export { applyProjectDocument, defaultProjectName };
