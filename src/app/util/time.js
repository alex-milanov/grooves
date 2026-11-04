import { Observable, share } from 'rxjs';

/** One shared RAF clock for UI + schedulers (js-loop-station / world-metronome). */
const frame$ = new Observable((subscriber) => {
  let id = 0;
  const tick = (t) => {
    subscriber.next(t);
    id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(id);
}).pipe(share({ resetOnRefCountZero: true }));

export const frame = () => frame$;
