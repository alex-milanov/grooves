import { fromEvent, filter, startWith, map, distinctUntilChanged, pairwise, merge } from 'rxjs';
import { dispatch } from 'iblokz-state';
import { patch } from '../state';
import { WORKSPACE_LOOPS } from '../state/ui';
import { MOBILE_BREAKPOINT } from '../state/viewport';
import { stepsPerBar } from '../state/sequencer-measures';
import { afterPaint, animateBoxSize, whenTransitionEnd } from '../util/transition';
import { isFullscreen } from '../util/fullscreen';

let resizeObserver = null;
let fitRaf = 0;
let animGen = 0;
let state$Ref = null;

/** Safety if transitionend never fires (longer than panel CSS max-width 0.3s). */
const PANEL_TRANSITION_FALLBACK_MS = 1000;
const LIBRARY_RESIZE_MS = 300;

/**
 * Unscaled size of the workspace surface. Prefer the laid-out border box of
 * `.workspace-inner` (main + asides); fall back to scroll metrics.
 * Must run while `.workspace` is `width: max-content` (not flex-shrunk).
 */
const measureWorkspace = (el) => {
  const width = Math.max(el.scrollWidth, el.offsetWidth);
  const height = Math.max(el.scrollHeight, el.offsetHeight);
  return width > 0 && height > 0 ? { width, height } : null;
};

/** Content-box of the wrapper = full flex slot minus CSS padding (not window.innerWidth). */
const measureAvail = (wrapper) => {
  const cs = getComputedStyle(wrapper);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) || 0;
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) || 0;
  // Small inset for subpixel rounding into overflow:hidden.
  const inset = 2;
  return {
    width: wrapper.clientWidth - padX - inset * 2,
    height: wrapper.clientHeight - padY - inset * 2,
  };
};

const isAnimating = () => !!state$Ref?.getValue()?.viewport?.animating;

const fitWorkspace = () => {
  if (isAnimating()) return;

  const wrapper = document.querySelector('.workspace-wrapper');
  const content = document.querySelector('.workspace > *');
  if (!wrapper || !content) return;

  const bounds = measureWorkspace(content);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

  const avail = measureAvail(wrapper);
  if (avail.width <= 0 || avail.height <= 0) return;

  const scale = Math.min(1, avail.width / bounds.width, avail.height / bounds.height);

  document.documentElement.style.setProperty('--workspace-scale', scale.toFixed(4));
};

const scheduleFit = () => {
  cancelAnimationFrame(fitRaf);
  fitRaf = requestAnimationFrame(fitWorkspace);
};

const beginAnimating = () => {
  const gen = ++animGen;
  dispatch(patch(['viewport', 'animating'], true));
  return gen;
};

const endAnimating = (gen) => {
  if (gen !== animGen) return;
  if (!isAnimating()) return;
  dispatch(patch(['viewport', 'animating'], false));
  observeWorkspace();
  fitWorkspace();
};

const libraryOpen = (s) =>
  s.activeWorkspace === WORKSPACE_LOOPS
    ? s.selectedSlot != null && !!s.loopsLibrary
    : s.selectedRow != null && !!s.drumsLibrary;

const settingsOpen = (s) =>
  s.activeWorkspace === WORKSPACE_LOOPS
    ? s.selectedSlot != null && !!s.loopsSettings
    : s.selectedRow != null && !!s.drumsSettings;

const panelLayoutChanged = (a, b) =>
  a.selectedRow !== b.selectedRow ||
  a.selectedSlot !== b.selectedSlot ||
  a.drumsLibrary !== b.drumsLibrary ||
  a.drumsSettings !== b.drumsSettings ||
  a.loopsLibrary !== b.loopsLibrary ||
  a.loopsSettings !== b.loopsSettings;

/**
 * Freeze scale via state while library/settings max-width runs, then refit.
 * Completes on transitionend (not a hardcoded 300ms guess).
 */
const beginPanelAnimation = (prev, next) => {
  const gen = beginAnimating();

  const waitLibrary = libraryOpen(prev) !== libraryOpen(next);
  const waitSettings = settingsOpen(prev) !== settingsOpen(next);

  afterPaint().then(() => {
    if (gen !== animGen) return;

    const waits = [];
    if (waitLibrary) {
      waits.push(
        whenTransitionEnd(document.querySelector('.workspace .library'), {
          property: 'max-width',
          timeoutMs: PANEL_TRANSITION_FALLBACK_MS,
        }),
      );
    }
    if (waitSettings) {
      waits.push(
        whenTransitionEnd(document.querySelector('.workspace .settings'), {
          property: 'max-width',
          timeoutMs: PANEL_TRANSITION_FALLBACK_MS,
        }),
      );
    }

    if (waits.length === 0) {
      endAnimating(gen);
      return;
    }

    Promise.all(waits).then(() => endAnimating(gen));
  });
};

/**
 * Directory navigation changes list height/width — FLIP-animate the open library
 * and freeze workspace scale until that size transition ends.
 * `from` must be measured before the snabbdom patch (this subscriber runs first).
 */
const beginLibraryContentResize = (from) => {
  const el = document.querySelector('.workspace .library.visible');
  if (!el || !from) return;

  const gen = beginAnimating();
  animateBoxSize(el, from, {
    durationMs: LIBRARY_RESIZE_MS,
    timeoutMs: PANEL_TRANSITION_FALLBACK_MS,
  }).then(() => endAnimating(gen));
};

const observeWorkspace = () => {
  if (!resizeObserver) return;
  resizeObserver.disconnect();

  const wrapper = document.querySelector('.workspace-wrapper');
  const content = document.querySelector('.workspace > *');
  if (wrapper) resizeObserver.observe(wrapper);
  if (!content) return;

  resizeObserver.observe(content);
  content
    .querySelectorAll('main, .library, .settings, .mixer-console')
    .forEach((el) => resizeObserver.observe(el));
};

let onStop = () => {};
export const stop = () => onStop();

export const start = ({ state$ }) => {
  const subs = [];
  state$Ref = state$;

  resizeObserver = new ResizeObserver(scheduleFit);

  subs.push(
    fromEvent(document, 'mousemove').subscribe((ev) =>
      dispatch(
        patch(['viewport', 'mouse'], {
          x: ev.pageX,
          y: ev.pageY,
        }),
      ),
    ),
  );

  subs.push(
    fromEvent(document, 'mousedown')
      .pipe(filter((ev) => ev.target.tagName === 'CANVAS'))
      .subscribe(() => dispatch(patch(['viewport', 'mouse'], { down: true }))),
  );

  subs.push(
    fromEvent(document, 'mouseup').subscribe(() =>
      dispatch(patch(['viewport', 'mouse'], { down: false })),
    ),
  );

  const publishScreen = () => {
    // visualViewport tracks mobile browser chrome; fall back to layout viewport.
    const vv = window.visualViewport;
    const width = Math.round(vv?.width ?? window.innerWidth);
    const height = Math.round(vv?.height ?? window.innerHeight);
    const size =
      width >= 1200
        ? 'xl'
        : width >= 992
          ? 'lg'
          : width >= 768
            ? 'md'
            : width >= 576
              ? 'sm'
              : 'xs';
    dispatch((s) => ({
      ...s,
      viewport: {
        ...s.viewport,
        mobile: width < MOBILE_BREAKPOINT,
        screen: {
          ...s.viewport?.screen,
          width,
          height,
          size,
        },
      },
    }));
    scheduleFit();
  };

  subs.push(fromEvent(window, 'resize').pipe(startWith({})).subscribe(publishScreen));

  if (window.visualViewport) {
    subs.push(fromEvent(window.visualViewport, 'resize').subscribe(publishScreen));
    subs.push(fromEvent(window.visualViewport, 'scroll').subscribe(scheduleFit));
  }

  subs.push(
    fromEvent(window, 'scroll')
      .pipe(startWith({}))
      .subscribe(() =>
        dispatch(
          patch(['viewport', 'screen'], {
            scroll: { x: window.scrollX, y: window.scrollY },
          }),
        ),
      ),
  );

  subs.push(
    merge(
      fromEvent(document, 'fullscreenchange'),
      fromEvent(document, 'webkitfullscreenchange'),
    )
      .pipe(startWith(null))
      .subscribe(() => dispatch(patch(['viewport', 'fullscreen'], isFullscreen()))),
  );

  // Library path: measure size before UI patch, then FLIP after paint.
  subs.push(
    state$
      .pipe(
        map((s) => (s.library?.path ?? []).join('\0')),
        distinctUntilChanged(),
        pairwise(),
      )
      .subscribe(() => {
        const el = document.querySelector('.workspace .library.visible');
        if (!el) return;
        const from = el.getBoundingClientRect();
        beginLibraryContentResize({ width: from.width, height: from.height });
      }),
  );

  subs.push(
    state$
      .pipe(
        map((s) => {
          const drums = s.tracks?.find((t) => t.type === 'sample-seq');
          return {
            selectedRow: s.ui?.drums?.selectedRow,
            selectedSlot: s.ui?.loops?.selectedSlot,
            drumsLibrary: s.ui?.drums?.panels?.library,
            drumsSettings: s.ui?.drums?.panels?.settings,
            loopsLibrary: s.ui?.loops?.panels?.library,
            loopsSettings: s.ui?.loops?.panels?.settings,
            rows: drums?.rows?.length,
            steps: stepsPerBar(s) || drums?.pattern?.steps,
            width: s.viewport?.screen?.width,
            activeWorkspace: s.ui?.activeWorkspace,
            stripOpen: s.ui?.workspacesStripOpen,
          };
        }),
        distinctUntilChanged(
          (a, b) =>
            a.selectedRow === b.selectedRow &&
            a.selectedSlot === b.selectedSlot &&
            a.drumsLibrary === b.drumsLibrary &&
            a.drumsSettings === b.drumsSettings &&
            a.loopsLibrary === b.loopsLibrary &&
            a.loopsSettings === b.loopsSettings &&
            a.rows === b.rows &&
            a.steps === b.steps &&
            a.width === b.width &&
            a.activeWorkspace === b.activeWorkspace &&
            a.stripOpen === b.stripOpen,
        ),
        startWith(null),
        pairwise(),
      )
      .subscribe(([prev, next]) => {
        observeWorkspace();
        if (prev != null && panelLayoutChanged(prev, next)) {
          beginPanelAnimation(prev, next);
          return;
        }
        scheduleFit();
      }),
  );

  observeWorkspace();
  scheduleFit();

  onStop = () => {
    animGen += 1;
    cancelAnimationFrame(fitRaf);
    dispatch(patch(['viewport', 'animating'], false));
    state$Ref = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    subs.forEach((sub) => sub.unsubscribe());
  };
};

export default {
  start,
  stop,
};
