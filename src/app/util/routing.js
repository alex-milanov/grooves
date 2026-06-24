import { getSlotParams } from './loops-state';

export const getTrackInputId = (track) => `track-${track}-in`;

export const getLoopSlotInputId = (slot) => `loop-${slot}-in`;

export const buildDefaultRouting = (tracks, loopSlots = 4) => {
  const nodes = [
    { id: 'master', kind: 'master' },
    { id: 'dest', kind: 'destination' },
    { id: 'part-drums', kind: 'part-fader' },
    { id: 'part-loops', kind: 'part-fader' },
    { id: 'bus-reverb', kind: 'bus', bus: 'reverb' },
    { id: 'bus-delay', kind: 'bus', bus: 'delay' },
  ];
  const edges = [
    { id: 'e-master-out', from: 'master', to: 'dest', gain: 1 },
    { id: 'e-bus-reverb-out', from: 'bus-reverb', to: 'master', gain: 1 },
    { id: 'e-bus-delay-out', from: 'bus-delay', to: 'master', gain: 1 },
    { id: 'e-part-master', from: 'part-drums', to: 'master', gainParam: ['partMixer', 'volume'] },
    { id: 'e-part-loops-master', from: 'part-loops', to: 'master', gain: 1 },
  ];

  for (let t = 0; t < tracks; t++) {
    nodes.push(
      { id: `track-${t}-in`, kind: 'track-in', track: t },
      { id: `track-${t}-vcf`, kind: 'insert', track: t, effect: 'vcf' },
      { id: `track-${t}-fader`, kind: 'fader', track: t },
    );
    edges.push(
      { id: `e-t${t}-in-vcf`, from: `track-${t}-in`, to: `track-${t}-vcf`, gain: 1 },
      { id: `e-t${t}-vcf-fader`, from: `track-${t}-vcf`, to: `track-${t}-fader`, gain: 1 },
      { id: `e-t${t}-dry`, from: `track-${t}-fader`, to: 'part-drums', gain: 1 },
      {
        id: `e-t${t}-rev`,
        from: `track-${t}-fader`,
        to: 'bus-reverb',
        gainParam: ['sequencer', 'trackParams', t, 'sends', 'reverb'],
      },
      {
        id: `e-t${t}-dly`,
        from: `track-${t}-fader`,
        to: 'bus-delay',
        gainParam: ['sequencer', 'trackParams', t, 'sends', 'delay'],
      },
    );
  }

  for (let i = 0; i < loopSlots; i++) {
    nodes.push(
      { id: `loop-${i}-in`, kind: 'track-in', slot: i },
      { id: `loop-${i}-vcf`, kind: 'insert', slot: i, effect: 'vcf' },
      { id: `loop-${i}-fader`, kind: 'fader', slot: i },
    );
    edges.push(
      { id: `e-loop${i}-in-vcf`, from: `loop-${i}-in`, to: `loop-${i}-vcf`, gain: 1 },
      { id: `e-loop${i}-vcf-fader`, from: `loop-${i}-vcf`, to: `loop-${i}-fader`, gain: 1 },
      { id: `e-loop${i}-dry`, from: `loop-${i}-fader`, to: 'part-loops', gain: 1 },
      {
        id: `e-loop${i}-rev`,
        from: `loop-${i}-fader`,
        to: 'bus-reverb',
        gainParam: ['loopSlots', i, 'sends', 'reverb'],
      },
      {
        id: `e-loop${i}-dly`,
        from: `loop-${i}-fader`,
        to: 'bus-delay',
        gainParam: ['loopSlots', i, 'sends', 'delay'],
      },
    );
  }

  return { nodes, edges };
};

export const resolveEdgeGain = (edge, trackParams, partMixer = null, loopSlots = null) => {
  if (edge.gainParam) {
    const [root, ...rest] = edge.gainParam;
    if (root === 'partMixer' && rest[0] === 'volume') {
      if (partMixer?.muted) return 0;
      return partMixer?.volume ?? 1;
    }
    if (root === 'sequencer' && rest[0] === 'trackParams') {
      const track = rest[1];
      const key = rest[3];
      return trackParams?.[track]?.sends?.[key] ?? 0;
    }
    if (root === 'loopSlots') {
      const slotIndex = rest[0];
      const key = rest[2];
      return getSlotParams(loopSlots?.[slotIndex])?.sends?.[key] ?? 0;
    }
  }
  return edge.gain ?? 1;
};
