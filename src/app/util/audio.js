import { Subject } from 'rxjs';

export const context = new (
  window.AudioContext
  || window.webkitAudioContext
)();

export const sampleTriggered$ = new Subject();

export const resume = () =>
  context.state === 'suspended' ? context.resume() : Promise.resolve();

export const play = (buffer, when = context.currentTime, gain = 0.85, meta = {}) => {
  const source = context.createBufferSource();
  const out = context.createGain();
  source.buffer = buffer;
  out.gain.value = gain;
  source.connect(out);
  out.connect(context.destination);
  source.start(when);
  sampleTriggered$.next({
    when,
    duration: buffer.duration,
    gain,
    ...meta,
  });
};

export const stepTime = bpm => 60 / bpm / 4;

export const trackGain = (trackParams, track) => {
  const params = trackParams?.[track];
  if (params?.muted) return 0;
  return params?.volume ?? 0.85;
};
