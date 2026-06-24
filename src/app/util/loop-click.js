import { context } from './audio';
import { barSeconds, beatSeconds } from './transport-clock';

const scheduled = [];

const clearScheduled = () => {
  for (const id of scheduled) clearTimeout(id);
  scheduled.length = 0;
};

const playTick = (when, level = 0.15) => {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.frequency.value = 1200;
  osc.type = 'sine';
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(level, when + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(when);
  osc.stop(when + 0.05);
};

const scheduleClicks = (transport, startTime, endTime, { step = 'bar' } = {}) => {
  clearScheduled();
  const interval = step === 'beat' ? beatSeconds(transport) : barSeconds(transport);
  const beatsPerBar = transport?.timeSignature?.[0] ?? 4;
  if (!interval || endTime <= startTime) return clearScheduled;

  let t = startTime;
  let index = 0;
  while (t < endTime - 0.001) {
    const when = t;
    const level =
      step === 'beat' ? (index % beatsPerBar === 0 ? 0.22 : 0.12) : index % 4 === 0 ? 0.22 : 0.12;
    const delayMs = Math.max(0, (when - context.currentTime) * 1000);
    scheduled.push(
      setTimeout(() => {
        if (context.currentTime <= when + 0.1) playTick(when, level);
      }, delayMs),
    );
    t += interval;
    index += 1;
  }

  return clearScheduled;
};

/** Schedule quiet bar clicks from start until end (exclusive of end). */
export const scheduleBarClicks = (transport, startTime, endTime, options = {}) =>
  scheduleClicks(transport, startTime, endTime, { ...options, step: 'bar' });

/** Schedule beat clicks (e.g. 4 ticks for a 4/4 count-in bar). */
export const scheduleBeatClicks = (transport, startTime, endTime, options = {}) =>
  scheduleClicks(transport, startTime, endTime, { ...options, step: 'beat' });

export const stopBarClicks = () => clearScheduled();
