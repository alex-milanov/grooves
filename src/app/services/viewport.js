import { fromEvent, filter, startWith, map, distinctUntilChanged, pairwise } from 'rxjs';
import { dispatch } from 'iblokz-state';
import { patch } from '../state';
import { WORKSPACE_LOOPS } from '../util/workspaces';
import { afterPaint, animateBoxSize, whenTransitionEnd } from '../util/transition';

let resizeObserver = null;
let fitRaf = 0;
let animGen = 0;
let state$Ref = null;

/** Safety if transitionend never fires (longer than panel CSS max-width 0.3s). */
const PANEL_TRANSITION_FALLBACK_MS = 1000;
const LIBRARY_RESIZE_MS = 300;

const measureWorkspace = (el) => {
  const width = Math.max(el.scrollWidth, el.offsetWidth);
  const height = Math.max(el.scrollHeight, el.offsetHeight);
  return width > 0 && height > 0 ? { width, height } : null;
};

const isAnimating = () => !!state$Ref?.getValue()?.viewport?.animating;

const fitWorkspace = () => {
  if (isAnimating()) return;

  const wrapper = document.querySelector('.workspace-wrapper');
  const content = document.querySelector('.workspace > *');
  if (!wrapper || !content) return;

  const bounds = measureWorkspace(content);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

  const margin = 8;
  const availW = wrapper.clientWidth - margin * 2;
  const availH = wrapper.clientHeight - margin * 2;
  if (availW <= 0 || availH <= 0) return;

  const scale = Math.min(1, availW / bounds.width, availH / bounds.height);

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

  subs.push(
    fromEvent(window, 'resize')
      .pipe(startWith({}))
      .subscribe(() => {
        dispatch(
          patch(['viewport', 'screen'], {
            width: window.innerWidth,
            height: window.innerHeight,
            size:
              window.innerWidth >= 1200
                ? 'xl'
                : window.innerWidth >= 992
                  ? 'lg'
                  : window.innerWidth >= 768
                    ? 'md'
                    : window.innerWidth >= 576
                      ? 'sm'
                      : 'xs',
          }),
        );
        scheduleFit();
      }),
  );

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
            steps:
              s.transport?.timeSignature && s.transport?.resolution
                ? Number(
                    (
                      s.transport.resolution *
                      (s.transport.timeSignature[0] / s.transport.timeSignature[1])
                    ).toFixed(0),
                  )
                : drums?.pattern?.steps,
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
