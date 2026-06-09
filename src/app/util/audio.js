export const context = new (
  window.AudioContext
  || window.webkitAudioContext
)();

export const resume = () =>
  context.state === 'suspended' ? context.resume() : Promise.resolve();

export const play = (buffer, when = context.currentTime, gain = 0.85) => {
  const source = context.createBufferSource();
  const out = context.createGain();
  source.buffer = buffer;
  out.gain.value = gain;
  source.connect(out);
  out.connect(context.destination);
  source.start(when);
};

export const stepTime = bpm => 60 / bpm / 4;
