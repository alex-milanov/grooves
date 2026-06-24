import { fromEvent, filter, startWith, map, distinctUntilChanged } from 'rxjs';
import { dispatch } from 'iblokz-state';
import { patch } from '../state';

let resizeObserver = null;
let fitRaf = 0;
let transitionFitRaf = 0;
const PANEL_TRANSITION_MS = 300;

const measureWorkspace = (el) => {
  const width = Math.max(el.scrollWidth, el.offsetWidth);
  const height = Math.max(el.scrollHeight, el.offsetHeight);
  return width > 0 && height > 0 ? { width, height } : null;
};

const fitWorkspace = () => {
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

const startTransitionFit = () => {
  const end = performance.now() + PANEL_TRANSITION_MS + 50;
  const tick = () => {
    fitWorkspace();
    if (performance.now() < end) {
      transitionFitRaf = requestAnimationFrame(tick);
    }
  };
  cancelAnimationFrame(transitionFitRaf);
  transitionFitRaf = requestAnimationFrame(tick);
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
    .querySelectorAll('.sequencer, .library, .track-settings, .mixer-console')
    .forEach((el) => resizeObserver.observe(el));
};

export let stop = () => {};

export const start = ({ state$ }) => {
  const subs = [];

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

  subs.push(
    state$
      .pipe(
        map((s) => ({
          track: s.sequencer?.selectedTrack,
          library: s.sequencer?.panels?.library,
          settings: s.sequencer?.panels?.settings,
          tracks: s.sequencer?.tracks,
          steps:
            s.transport?.timeSignature && s.transport?.resolution
              ? Number(
                  (
                    s.transport.resolution *
                    (s.transport.timeSignature[0] / s.transport.timeSignature[1])
                  ).toFixed(0),
                )
              : s.sequencer?.steps,
          width: s.viewport?.screen?.width,
          activeWorkspace: s.ui?.activeWorkspace,
          stripOpen: s.ui?.workspacesStripOpen,
        })),
        distinctUntilChanged(
          (a, b) =>
            a.track === b.track &&
            a.library === b.library &&
            a.settings === b.settings &&
            a.tracks === b.tracks &&
            a.steps === b.steps &&
            a.width === b.width &&
            a.activeWorkspace === b.activeWorkspace &&
            a.stripOpen === b.stripOpen,
        ),
      )
      .subscribe(() => {
        observeWorkspace();
        scheduleFit();
        startTransitionFit();
      }),
  );

  observeWorkspace();
  scheduleFit();

  stop = () => {
    cancelAnimationFrame(fitRaf);
    cancelAnimationFrame(transitionFitRaf);
    resizeObserver?.disconnect();
    resizeObserver = null;
    subs.forEach((sub) => sub.unsubscribe());
  };
};

export default {
  start,
  stop,
};
