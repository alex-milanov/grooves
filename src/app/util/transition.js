/**
 * Resolves when `el` fires `transitionend` for `property` (own target only).
 * Falls back to `timeoutMs` if the event never arrives (interrupted / no transition).
 *
 * @param {Element | null | undefined} el
 * @param {{ property?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<void>}
 */
export const whenTransitionEnd = (el, { property = 'max-width', timeoutMs = 1000 } = {}) =>
  new Promise((resolve) => {
    if (!el) {
      resolve();
      return;
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener('transitionend', onEnd);
      clearTimeout(safety);
      resolve();
    };

    const onEnd = (ev) => {
      if (ev.target !== el) return;
      if (property && ev.propertyName !== property) return;
      finish();
    };

    el.addEventListener('transitionend', onEnd);
    const safety = setTimeout(finish, timeoutMs);
  });

/** After sync DOM patches in this turn, before the browser paints. */
export const afterDomUpdate = () =>
  new Promise((resolve) => {
    queueMicrotask(resolve);
  });

/** Double rAF — wait until after style/layout from the current patch flush. */
export const afterPaint = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });

/**
 * FLIP-animate `el` from a pre-update rect to its post-update size.
 * Call with `from` measured *before* the DOM patch.
 * Locks the old size in a microtask (before paint) so the new content doesn't
 * flash at full size for a frame — that flash read as a split-second bob.
 *
 * @param {Element | null | undefined} el
 * @param {{ width: number, height: number }} from
 * @param {{ durationMs?: number, timeoutMs?: number }} [opts]
 */
export const animateBoxSize = async (
  el,
  from,
  { durationMs = 300, timeoutMs = 1000 } = {},
) => {
  if (!el || !from) return;

  // UI patch runs in the same sync turn after the measurer; lock before paint.
  await afterDomUpdate();

  const prev = {
    height: el.style.height,
    width: el.style.width,
    overflow: el.style.overflow,
    transition: el.style.transition,
    maxHeight: el.style.maxHeight,
  };

  el.style.transition = 'none';
  el.style.overflow = 'hidden';
  // Clear CSS max-height clamp so we can measure/animate the real content box.
  el.style.maxHeight = 'none';

  el.style.height = 'auto';
  el.style.width = 'auto';
  const to = el.getBoundingClientRect();

  const dH = Math.abs(to.height - from.height);
  const dW = Math.abs(to.width - from.width);
  if (dH < 0.5 && dW < 0.5) {
    el.style.height = prev.height;
    el.style.width = prev.width;
    el.style.overflow = prev.overflow;
    el.style.transition = prev.transition;
    el.style.maxHeight = prev.maxHeight;
    return;
  }

  const changing = [];
  if (dH >= 0.5) changing.push('height');
  if (dW >= 0.5) changing.push('width');

  el.style.height = `${from.height}px`;
  el.style.width = `${from.width}px`;
  void el.offsetHeight;

  await new Promise((resolve) => requestAnimationFrame(resolve));

  el.style.transition = changing.map((p) => `${p} ${durationMs}ms ease`).join(', ');
  el.style.height = `${to.height}px`;
  el.style.width = `${to.width}px`;

  await Promise.all(
    changing.map((property) => whenTransitionEnd(el, { property, timeoutMs })),
  );

  el.style.transition = 'none';
  el.style.height = prev.height;
  el.style.width = prev.width;
  el.style.maxHeight = prev.maxHeight;
  el.style.overflow = prev.overflow;
  void el.offsetHeight;
  el.style.transition = prev.transition;
};
