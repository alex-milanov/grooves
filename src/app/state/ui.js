/** Workspace ids + UI chrome helpers (not util). */

export const WORKSPACE_DRUMS = 'drums';
export const WORKSPACE_LOOPS = 'loops';
export const WORKSPACE_MIXER = 'mixer';
export const WORKSPACE_SETTINGS = 'settings';

export const isDrumsWorkspace = (state) =>
  (state.ui?.activeWorkspace ?? WORKSPACE_DRUMS) === WORKSPACE_DRUMS;

export const isLoopsWorkspace = (state) => state.ui?.activeWorkspace === WORKSPACE_LOOPS;

export const isMixerWorkspace = (state) => state.ui?.activeWorkspace === WORKSPACE_MIXER;

export const isSettingsWorkspace = (state) => state.ui?.activeWorkspace === WORKSPACE_SETTINGS;
