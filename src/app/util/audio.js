import { Subject } from 'rxjs';

export const context = new (
  window.AudioContext
  || window.webkitAudioContext
)();

export const sampleTriggered$ = new Subject();

const scheduled = [];
const trackNodes = new Map();

const removeScheduled = entry => {
  const i = scheduled.indexOf(entry);
  if (i !== -1) scheduled.splice(i, 1);
};

export const getTrackGainNode = track => {
  if (!trackNodes.has(track)) {
    const gain = context.createGain();
    gain.gain.value = 0.85;
    gain.connect(context.destination);
    trackNodes.set(track, gain);
  }
  return trackNodes.get(track);
};

export const setTrackGainValue = (track, volume, muted) => {
  getTrackGainNode(track).gain.value = muted ? 0 : (volume ?? 0.85);
};

export const syncTrackGains = (trackParams, tracks) => {
  for (let track = 0; track < tracks; track++) {
    const params = trackParams?.[track];
    setTrackGainValue(track, params?.volume, params?.muted);
  }
};

export const resume = () =>
  context.state === 'suspended' ? context.resume() : Promise.resolve();

export const play = (buffer, when = context.currentTime, track = 0, meta = {}) => {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(getTrackGainNode(track));

  const entry = { source, when };
  scheduled.push(entry);
  source.onended = () => removeScheduled(entry);

  source.start(when);
  sampleTriggered$.next({
    when,
    duration: buffer.duration,
    track,
    ...meta,
  });
};

export const cancelScheduledAfter = cutoff => {
  for (let i = scheduled.length - 1; i >= 0; i--) {
    const { source, when } = scheduled[i];
    if (when >= cutoff) {
      try {
        source.stop(0);
      } catch (_) {
        /* already stopped */
      }
      scheduled.splice(i, 1);
    }
  }
};

export const cancelAllScheduled = () => {
  for (let i = scheduled.length - 1; i >= 0; i--) {
    try {
      scheduled[i].source.stop(0);
    } catch (_) {
      /* already stopped */
    }
  }
  scheduled.length = 0;
};

export const stepTime = bpm => 60 / bpm / 4;

export const trackGain = (trackParams, track) => {
  const params = trackParams?.[track];
  if (params?.muted) return 0;
  return params?.volume ?? 0.85;
};
