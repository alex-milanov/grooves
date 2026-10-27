/** Shared panel / breakpoint helpers (used by drums + loops state modules). */

export const MOBILE_BREAKPOINT = 900;

export const isMobile = (state) =>
  (state.viewport?.screen?.width ?? window.innerWidth) < MOBILE_BREAKPOINT;

export const defaultPanels = () => ({ library: false, settings: false });
