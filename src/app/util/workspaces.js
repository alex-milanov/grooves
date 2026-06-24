import { MOBILE_BREAKPOINT } from './panels';

export const WORKSPACE_DRUMS = 'drums';
export const WORKSPACE_LOOPS = 'loops';
export const WORKSPACE_MIXER = 'mixer';

export const defaultWorkspacesStripOpen = (width = window.innerWidth) => width >= MOBILE_BREAKPOINT;

export const isDrumsWorkspace = (state) =>
  (state.ui?.activeWorkspace ?? WORKSPACE_DRUMS) === WORKSPACE_DRUMS;

export const isLoopsWorkspace = (state) => state.ui?.activeWorkspace === WORKSPACE_LOOPS;

export const isMixerWorkspace = (state) => state.ui?.activeWorkspace === WORKSPACE_MIXER;

export const stripVisible = (state) => !!state.ui?.workspacesStripOpen;
