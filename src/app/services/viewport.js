import { fromEvent, filter, startWith, map, distinctUntilChanged } from 'rxjs';
import { dispatch } from 'iblokz-state';
import { patch } from '../state';
import { MOBILE_BREAKPOINT } from '../util/panels';

let resizeObserver = null;
let fitRaf = 0;
let transitionFitRaf = 0;
const PANEL_TRANSITION_MS = 300;

const isMobileViewport = () => window.innerWidth < MOBILE_BREAKPOINT;

const measureWorkspace = inner => {
  const width = Math.max(inner.scrollWidth, inner.offsetWidth);
  const height = Math.max(inner.scrollHeight, inner.offsetHeight);
  return width > 0 && height > 0 ? { width, height } : null;
};

const fitWorkspace = () => {
  const inner = document.querySelector('.workspace-inner');
  if (!inner) return;

  const isMobile = isMobileViewport();

  if (!isMobile) {
    document.documentElement.style.removeProperty('--workspace-scale');
    return;
  }

  const bounds = measureWorkspace(inner);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

  const margin = 12;
  const header = 72;
  const availW = window.innerWidth - margin * 2;
  const availH = window.innerHeight - header - margin;

  const scale = Math.min(1, availW / bounds.width, availH / bounds.height) * 0.97;

  document.documentElement.style.setProperty(
    '--workspace-scale',
    scale.toFixed(4),
  );
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
  const inner = document.querySelector('.workspace-inner');
  if (!inner) return;
  resizeObserver.observe(inner);
  inner.querySelectorAll('.sequencer, .library, .track-settings')
    .forEach(el => resizeObserver.observe(el));
};

export let stop = () => {};

export const start = ({ state$ }) => {
  const subs = [];

  resizeObserver = new ResizeObserver(scheduleFit);

  subs.push(
    fromEvent(document, 'mousemove').subscribe(ev =>
      dispatch(patch(['viewport', 'mouse'], {
        x: ev.pageX,
        y: ev.pageY,
      })),
    ),
  );

  subs.push(
    fromEvent(document, 'mousedown')
      .pipe(filter(ev => ev.target.tagName === 'CANVAS'))
      .subscribe(() => dispatch(patch(['viewport', 'mouse'], { down: true }))),
  );

  subs.push(
    fromEvent(document, 'mouseup')
      .subscribe(() => dispatch(patch(['viewport', 'mouse'], { down: false }))),
  );

  subs.push(
    fromEvent(window, 'resize')
      .pipe(startWith({}))
      .subscribe(() => {
        dispatch(patch(['viewport', 'screen'], {
          width: window.innerWidth,
          height: window.innerHeight,
          size: window.innerWidth >= 1200
            ? 'xl'
            : window.innerWidth >= 992
              ? 'lg'
              : window.innerWidth >= 768
                ? 'md'
                : window.innerWidth >= 576
                  ? 'sm'
                  : 'xs',
        }));
        scheduleFit();
      }),
  );

  subs.push(
    fromEvent(window, 'scroll')
      .pipe(startWith({}))
      .subscribe(() => dispatch(patch(['viewport', 'screen'], {
        scroll: { x: window.scrollX, y: window.scrollY },
      }))),
  );

  subs.push(state$.pipe(
    map(s => ({
      track: s.sequencer?.selectedTrack,
      library: s.sequencer?.panels?.library,
      settings: s.sequencer?.panels?.settings,
      tracks: s.tracks ?? s.sequencer?.tracks,
      steps: s.sequencer?.timeSignature && s.sequencer?.resolution
        ? Number((s.sequencer.resolution * (
          s.sequencer.timeSignature[0] / s.sequencer.timeSignature[1]
        )).toFixed(0))
        : s.sequencer?.steps,
      width: s.viewport?.screen?.width,
    })),
    distinctUntilChanged((a, b) =>
      a.track === b.track
      && a.library === b.library
      && a.settings === b.settings
      && a.tracks === b.tracks
      && a.steps === b.steps
      && a.width === b.width,
    ),
  ).subscribe(() => {
    observeWorkspace();
    scheduleFit();
    startTransitionFit();
  }));

  observeWorkspace();
  scheduleFit();

  stop = () => {
    cancelAnimationFrame(fitRaf);
    cancelAnimationFrame(transitionFitRaf);
    resizeObserver?.disconnect();
    resizeObserver = null;
    subs.forEach(sub => sub.unsubscribe());
  };
};

export default {
  start,
  stop,
};
