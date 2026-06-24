import { Subject } from 'rxjs';
import {
  context,
  create as createAudio,
  update as updateAudio,
  vcf as createVcf,
} from 'iblokz-audio';
import { resolveEdgeGain } from './routing';
import { getTrackParams } from './track-params';
import { getSlotParams } from './loops-state';

export { context };

export const sampleTriggered$ = new Subject();

const scheduled = [];
const nodeRegistry = new Map();
const edgeGains = new Map();
let wired = false;

const removeScheduled = (entry) => {
  const i = scheduled.indexOf(entry);
  if (i !== -1) scheduled.splice(i, 1);
};

const createDelayBus = ({ time = 0.375, feedback = 0.35 } = {}) => {
  const input = context.createGain();
  const output = context.createGain();
  const delay = context.createDelay(Math.max(time * 2, 1));
  const feedbackGain = context.createGain();
  delay.delayTime.value = time;
  feedbackGain.gain.value = feedback;
  input.connect(delay);
  delay.connect(output);
  delay.connect(feedbackGain);
  feedbackGain.connect(delay);
  return { input, output, delay, feedbackGain };
};

const ensureNode = (def, mixer) => {
  if (nodeRegistry.has(def.id)) return nodeRegistry.get(def.id);

  let entry;
  switch (def.kind) {
    case 'track-in': {
      const gain = context.createGain();
      gain.gain.value = 1;
      entry = { def, input: gain, output: gain };
      break;
    }
    case 'insert': {
      const filter = createVcf({ type: 'lowpass', cutoff: 0.64, resonance: 0 });
      entry = { def, iblokz: filter, input: filter.through, output: filter.through };
      break;
    }
    case 'fader': {
      const gain = context.createGain();
      gain.gain.value = 0.85;
      entry = { def, input: gain, output: gain, track: def.track };
      break;
    }
    case 'part-fader': {
      const gain = context.createGain();
      gain.gain.value = 1;
      entry = { def, input: gain, output: gain };
      break;
    }
    case 'bus': {
      if (def.bus === 'reverb') {
        const buses = mixer?.buses?.reverb ?? {};
        const reverb = createAudio('reverb', {
          seconds: buses.seconds ?? 3,
          decay: buses.decay ?? 2,
          dry: 0,
          wet: 1,
        });
        entry = { def, iblokz: reverb, input: reverb.input, output: reverb.output };
      } else {
        const buses = mixer?.buses?.delay ?? {};
        const delay = createDelayBus(buses);
        entry = { def, ...delay };
      }
      break;
    }
    case 'master': {
      const gain = context.createGain();
      gain.gain.value = 1;
      entry = { def, input: gain, output: gain };
      break;
    }
    case 'destination':
      entry = { def, input: context.destination, output: null };
      break;
    default:
      entry = { def, input: null, output: null };
  }

  nodeRegistry.set(def.id, entry);
  return entry;
};

export const ensureNodes = (routing, mixer) => {
  routing.nodes.forEach((def) => ensureNode(def, mixer));
};

const getEdgeGain = (edgeId) => {
  if (!edgeGains.has(edgeId)) {
    edgeGains.set(edgeId, context.createGain());
  }
  return edgeGains.get(edgeId);
};

const wireEdges = (routing) => {
  routing.edges.forEach((edge) => {
    if (edge.enabled === false) return;
    const from = nodeRegistry.get(edge.from);
    const to = nodeRegistry.get(edge.to);
    if (!from?.output || !to?.input) return;
    const gain = getEdgeGain(edge.id);
    try {
      from.output.connect(gain);
      gain.connect(to.input);
    } catch (_) {
      /* already connected */
    }
  });
  wired = true;
};

const updateEdgeGains = (routing, trackParams, partMixer, loopSlots) => {
  routing.edges.forEach((edge) => {
    const gain = getEdgeGain(edge.id);
    const enabled = edge.enabled !== false;
    gain.gain.value = enabled ? resolveEdgeGain(edge, trackParams, partMixer, loopSlots) : 0;
  });
};

const syncMasterVolume = (mixer) => {
  const master = nodeRegistry.get('master');
  if (master?.output) master.output.gain.value = mixer?.master?.volume ?? 1;
};

const syncBusParams = (mixer) => {
  const rev = nodeRegistry.get('bus-reverb');
  if (rev?.iblokz) {
    const b = mixer?.buses?.reverb ?? {};
    updateAudio(rev.iblokz, {
      seconds: b.seconds ?? 3,
      decay: b.decay ?? 2,
      dry: 0,
      wet: 1,
    });
  }
  const dly = nodeRegistry.get('bus-delay');
  if (dly?.delay) {
    const b = mixer?.buses?.delay ?? {};
    dly.delay.delayTime.value = b.time ?? 0.375;
    dly.feedbackGain.gain.value = b.feedback ?? 0.35;
  }
};

export const syncTrackMixer = (trackParams, tracks) => {
  for (let track = 0; track < tracks; track++) {
    const params = getTrackParams(trackParams, track);
    const fader = nodeRegistry.get(`track-${track}-fader`);
    if (fader?.output) {
      fader.output.gain.value = params.muted ? 0 : params.volume;
    }
    const vcfNode = nodeRegistry.get(`track-${track}-vcf`);
    if (vcfNode?.iblokz) {
      updateAudio(vcfNode.iblokz, {
        type: 'lowpass',
        cutoff: params.vcf.cutoff,
        resonance: params.vcf.resonance,
      });
    }
  }
};

export const syncLoopSlotMixer = (slots) => {
  if (!slots?.length) return;
  for (let slot = 0; slot < slots.length; slot++) {
    const params = getSlotParams(slots[slot]);
    const fader = nodeRegistry.get(`loop-${slot}-fader`);
    if (fader?.output) {
      fader.output.gain.value = params.muted ? 0 : params.volume;
    }
    const vcfNode = nodeRegistry.get(`loop-${slot}-vcf`);
    if (vcfNode?.iblokz) {
      updateAudio(vcfNode.iblokz, {
        type: 'lowpass',
        cutoff: params.vcf.cutoff,
        resonance: params.vcf.resonance,
      });
    }
  }
};

export const applyRouting = (
  routing,
  trackParams,
  mixer,
  partMixer,
  { reconnect = false, loopsTrack = null } = {},
) => {
  ensureNodes(routing, mixer);
  if (!wired || reconnect) {
    wireEdges(routing);
  }
  const loopSlots = loopsTrack?.loop?.slots;
  updateEdgeGains(routing, trackParams, partMixer, loopSlots);
  const trackCount = routing.nodes.filter((n) => n.kind === 'fader' && n.track != null).length;
  syncTrackMixer(trackParams, trackCount);
  syncLoopSlotMixer(loopSlots);
  syncMasterVolume(mixer);
  syncBusParams(mixer);
};

export const getTrackInput = (track) => {
  const node = nodeRegistry.get(`track-${track}-in`);
  return node?.output ?? null;
};

export const getLoopSlotInput = (slotIndex) => {
  const node = nodeRegistry.get(`loop-${slotIndex}-in`);
  return node?.output ?? null;
};

export const getPartLoopsInput = () => {
  const node = nodeRegistry.get('part-loops');
  return node?.input ?? null;
};

export const syncPartLoopsMixer = (mixer) => {
  const part = nodeRegistry.get('part-loops');
  if (!part?.output) return;
  const vol = mixer?.muted ? 0 : (mixer?.volume ?? 1);
  part.output.gain.value = vol;
};

export const resume = () => (context.state === 'suspended' ? context.resume() : Promise.resolve());

export const play = (buffer, when = context.currentTime, track = 0, meta = {}) => {
  const input = getTrackInput(track);
  if (!input) return;

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(input);

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

export const cancelScheduledAfter = (cutoff) => {
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

export const stepTime = (bpm) => 60 / bpm / 4;

/** Total output latency (s): baseLatency + outputLatency — for UI sync with heard audio. */
export const getOutputLatency = (ctx = context) =>
  (ctx.baseLatency ?? 0) + (ctx.outputLatency ?? 0);

export { trackGain } from './track-params';
