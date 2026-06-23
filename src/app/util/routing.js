export const getTrackInputId = (track) => `track-${track}-in`;

export const buildDefaultRouting = (tracks) => {
  const nodes = [
    { id: 'master', kind: 'master' },
    { id: 'dest', kind: 'destination' },
    { id: 'bus-reverb', kind: 'bus', bus: 'reverb' },
    { id: 'bus-delay', kind: 'bus', bus: 'delay' },
  ];
  const edges = [
    { id: 'e-master-out', from: 'master', to: 'dest', gain: 1 },
    { id: 'e-bus-reverb-out', from: 'bus-reverb', to: 'master', gain: 1 },
    { id: 'e-bus-delay-out', from: 'bus-delay', to: 'master', gain: 1 },
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
      { id: `e-t${t}-dry`, from: `track-${t}-fader`, to: 'master', gain: 1 },
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

  return { nodes, edges };
};

export const resolveEdgeGain = (edge, trackParams) => {
  if (edge.gainParam) {
    const track = edge.gainParam[2];
    const key = edge.gainParam[4];
    return trackParams?.[track]?.sends?.[key] ?? 0;
  }
  return edge.gain ?? 1;
};
