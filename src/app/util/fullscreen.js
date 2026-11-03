/** True when the document (or a legacy webkit element) is fullscreen. */
export const isFullscreen = () =>
  !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement
  );

const docEl = () => document.documentElement;

/**
 * Enter fullscreen (hides mobile browser chrome where supported).
 * Must run from a user gesture. No-ops when unsupported or denied (e.g. iOS Safari).
 */
export const requestFullscreen = () => {
  if (typeof document === 'undefined' || isFullscreen()) return;

  const el = docEl();
  const request =
    el.requestFullscreen?.bind(el) ||
    el.webkitRequestFullscreen?.bind(el) ||
    el.msRequestFullscreen?.bind(el);

  if (!request) return;

  try {
    const result = request({ navigationUI: 'hide' });
    if (result?.catch) result.catch(() => {});
  } catch (_) {
    try {
      request();
    } catch (__) {
      /* unsupported / blocked */
    }
  }
};

/** Leave fullscreen if active. */
export const exitFullscreen = () => {
  if (typeof document === 'undefined' || !isFullscreen()) return;

  const exit =
    document.exitFullscreen?.bind(document) ||
    document.webkitExitFullscreen?.bind(document) ||
    document.msExitFullscreen?.bind(document);

  if (!exit) return;

  try {
    const result = exit();
    if (result?.catch) result.catch(() => {});
  } catch (_) {
    /* ignore */
  }
};

/** Toggle document fullscreen. */
export const toggleFullscreen = () => {
  if (isFullscreen()) exitFullscreen();
  else requestFullscreen();
};

/** @deprecated Use requestFullscreen */
export const ensureFullscreen = requestFullscreen;
