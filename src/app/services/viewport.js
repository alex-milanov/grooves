import { fromEvent, filter, startWith, map, distinctUntilChanged } from 'rxjs';
import { dispatch } from 'iblokz-state';
import { patch } from '../state';

let resizeObserver = null;
let fitRaf = 0;

const measureWorkspace = inner => {
  const sequencer = inner.querySelector('.sequencer');
  if (!sequencer) return null;

  let width = sequencer.offsetWidth;
  const height = sequencer.offsetHeight;

  const library = inner.querySelector('.library.visible');
  if (library) {
    const style = getComputedStyle(library);
    width += library.offsetWidth
      + (parseFloat(style.marginRight) || 0);
  }

  const settings = inner.querySelector('.track-settings.visible');
  if (settings) {
    const style = getComputedStyle(settings);
    width += settings.offsetWidth
      + (parseFloat(style.marginLeft) || 0);
  }

  return { width, height };
};

const fitWorkspace = () => {
  const inner = document.querySelector('.workspace-inner');
  if (!inner) return;

  const bounds = measureWorkspace(inner);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

  const margin = 32;
  const header = 72;
  const availW = window.innerWidth - margin * 2;
  const availH = window.innerHeight - header - margin;

  // Slight inset so panel edges and shadows stay inside the viewport
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
      tracks: s.tracks ?? s.sequencer?.tracks,
      steps: s.sequencer?.timeSignature && s.sequencer?.resolution
        ? Number((s.sequencer.resolution * (
          s.sequencer.timeSignature[0] / s.sequencer.timeSignature[1]
        )).toFixed(0))
        : s.sequencer?.steps,
    })),
    distinctUntilChanged((a, b) =>
      a.track === b.track && a.tracks === b.tracks && a.steps === b.steps,
    ),
  ).subscribe(() => {
    observeWorkspace();
    scheduleFit();
    // Re-fit after panel slide-in transition (0.3s)
    setTimeout(scheduleFit, 350);
  }));

  observeWorkspace();
  scheduleFit();

  stop = () => {
    cancelAnimationFrame(fitRaf);
    resizeObserver?.disconnect();
    resizeObserver = null;
    subs.forEach(sub => sub.unsubscribe());
  };
};

export default {
  start,
  stop,
};
