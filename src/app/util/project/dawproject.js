/**
 * DAWproject MVP export — session Scenes / ClipSlots (Bitwig-openable).
 * Drums → Notes clip; filled loop slots → Audio clips (L0 WAV).
 * Loop VCF → Equalizer (lowPass); reverb/delay → effect Channels + post Sends.
 * No Arrangement timeline content. Bus FX engines are empty (no portable reverb/delay).
 */

import JSZip from 'jszip';
import { samples } from '../../services/audio';
import { getDrumsRows, getDrumsTrack } from '../../state/drums';
import { getLoopsTrack, getSlotParams, loopBufferKey, slotHasContent } from '../../state/loops';
import { bufferToWav } from '../buffer-to-wav';
import { beatSeconds } from '../transport-clock';
import { collectDrumNoteList, drumsPatternBeats } from './midi';
import { loopMediaPath } from './paths';

const APP_NAME = 'Grooves';
const APP_VERSION = '1.0.0';
const PROJECT_FORMAT_VERSION = '1.0';
/** Nyquist assumption for cutoff→Hz (matches iblokz-audio at 44.1k). */
const EXPORT_SAMPLE_RATE = 44100;

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fmt = (n, digits = 6) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0';
  return String(Number(x.toFixed(digits)));
};

const createIds = () => {
  let n = 0;
  return () => {
    const id = `id${n}`;
    n += 1;
    return id;
  };
};

/** Same mapping as iblokz-audio `cutoffToFreq` (0–1 → Hz). */
export const cutoffToHz = (cutoff, sampleRate = EXPORT_SAMPLE_RATE) => {
  const c = Math.max(0, Math.min(1, Number(cutoff) || 0));
  const minValue = 40;
  const maxValue = sampleRate / 2;
  const numberOfOctaves = Math.log(maxValue / minValue) / Math.LN2;
  return maxValue * 2 ** (numberOfOctaves * (c - 1));
};

/** Same mapping as iblokz-audio VCF Q (`resonance * 30`). */
export const resonanceToQ = (resonance) => Math.max(0.1, (Number(resonance) || 0) * 30);

const indentBlock = (text, spaces) => {
  const pad = ' '.repeat(spaces);
  return String(text)
    .split('\n')
    .map((line) => (line.length ? pad + line : line))
    .join('\n');
};

const realParam = (nextId, name, { value, min, max, unit }) =>
  `<${name} max="${fmt(max)}" min="${fmt(min)}" unit="${esc(unit)}" value="${fmt(value)}" id="${esc(nextId())}" name="${esc(name)}"/>`;

/** Approximate VCF as a single lowPass Equalizer band. */
const equalizerFromVcfXml = (nextId, vcf = {}) => {
  const freq = cutoffToHz(vcf.cutoff ?? 0.64);
  const q = resonanceToQ(vcf.resonance ?? 0);
  const eqId = nextId();
  const enabledId = nextId();
  const bandEnabledId = nextId();
  return [
    `<Equalizer deviceRole="audioFX" deviceName="Filter" loaded="true" id="${esc(eqId)}" name="VCF">`,
    `  <Enabled value="true" id="${esc(enabledId)}" name="On/Off"/>`,
    `  <Band type="lowPass" order="0">`,
    `    ${realParam(nextId, 'Freq', { value: freq, min: 20, max: 22000, unit: 'hertz' })}`,
    `    ${realParam(nextId, 'Q', { value: q, min: 0.1, max: 30, unit: 'linear' })}`,
    `    <Enabled value="true" id="${esc(bandEnabledId)}" name="Enabled"/>`,
    `  </Band>`,
    `  <Parameters/>`,
    `</Equalizer>`,
  ].join('\n');
};

const sendsXml = (nextId, sends, destinations) => {
  const entries = [
    { key: 'reverb', name: 'Reverb', dest: destinations.reverb },
    { key: 'delay', name: 'Delay', dest: destinations.delay },
  ].filter((e) => e.dest);
  if (!entries.length) return '';

  const lines = entries.map(({ key, name, dest }) => {
    const level = Math.max(0, Math.min(1, Number(sends?.[key]) || 0));
    const sendId = nextId();
    const enableId = nextId();
    return [
      `<Send type="post" destination="${esc(dest)}" id="${esc(sendId)}" name="${esc(name)}">`,
      `  ${realParam(nextId, 'Volume', { value: level, min: 0, max: 1, unit: 'linear' })}`,
      `  <Enable value="${level > 0.0001 ? 'true' : 'false'}" id="${esc(enableId)}" name="Enable"/>`,
      `</Send>`,
    ].join('\n');
  });

  return ['<Sends>', ...lines.map((b) => indentBlock(b, 2)), '</Sends>'].join('\n');
};

const channelXml = ({
  id,
  nextId,
  role,
  destination,
  volume = 1,
  pan = 0.5,
  muted = false,
  solo = false,
  devicesXml = '',
  sendsBlockXml = '',
  comment = '',
}) => {
  const volId = nextId();
  const panId = nextId();
  const muteId = nextId();
  const dest = destination ? ` destination="${esc(destination)}"` : '';
  const commentAttr = comment ? ` comment="${esc(comment)}"` : '';
  const parts = [
    `<Channel audioChannels="2"${dest} role="${esc(role)}" solo="${solo ? 'true' : 'false'}" id="${esc(id)}"${commentAttr}>`,
  ];
  if (devicesXml) {
    parts.push('  <Devices>', indentBlock(devicesXml, 4), '  </Devices>');
  }
  if (sendsBlockXml) {
    parts.push(indentBlock(sendsBlockXml, 2));
  }
  parts.push(
    `  <Mute value="${muted ? 'true' : 'false'}" id="${esc(muteId)}" name="Mute"/>`,
    `  <Pan max="1.0" min="0.0" unit="normalized" value="${fmt(pan)}" id="${esc(panId)}" name="Pan"/>`,
    `  <Volume max="2.0" min="0.0" unit="linear" value="${fmt(volume)}" id="${esc(volId)}" name="Volume"/>`,
    `</Channel>`,
  );
  return parts.join('\n');
};

/** Mean of per-row drum send amounts (single drums track in export). */
export const averageDrumSends = (state) => {
  const rows = getDrumsRows(state);
  if (!rows.length) return { reverb: 0, delay: 0 };
  let reverb = 0;
  let delay = 0;
  rows.forEach((row) => {
    reverb += Number(row.sends?.reverb) || 0;
    delay += Number(row.sends?.delay) || 0;
  });
  return { reverb: reverb / rows.length, delay: delay / rows.length };
};

/** Filled loop slots with buffer + mixer params for export. */
export const collectLoopExportSlots = (state) => {
  const track = getLoopsTrack(state);
  const slots = track?.loop?.slots ?? [];
  return slots
    .map((slot, index) => {
      if (!slotHasContent(slot)) return null;
      const layer = 0;
      const cacheKey = slot.bufferKeys?.[layer] ?? loopBufferKey(index, layer);
      const buffer = samples.get(cacheKey);
      if (!buffer) {
        console.warn('dawproject: missing loop buffer', slot.id, cacheKey);
        return null;
      }
      const slotId = slot.id || `slot-${index}`;
      const path = loopMediaPath(slotId, layer);
      const params = getSlotParams(slot);
      const durationSec = Number(slot.duration) > 0 ? Number(slot.duration) : buffer.duration;
      return {
        index,
        slotId,
        name: `Loop ${index + 1}`,
        path,
        buffer,
        durationSec,
        volume: params.volume ?? 0.85,
        muted: !!params.muted,
        pan: 0.5,
        vcf: { ...params.vcf },
        sends: { ...params.sends },
      };
    })
    .filter(Boolean);
};

export const buildMetadataXml = (state) => {
  const title = esc(state.name || 'Grooves');
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<MetaData>`,
    `  <Title>${title}</Title>`,
    `  <Comment>Exported from ${esc(APP_NAME)} ${esc(APP_VERSION)}</Comment>`,
    `</MetaData>`,
    ``,
  ].join('\n');
};

/**
 * Build project.xml for a session-clip export.
 * @returns {{ xml: string, media: { path: string, buffer: AudioBuffer }[] }}
 */
export const buildDawprojectXml = (state) => {
  const nextId = createIds();
  const bpm = state.transport?.bpm ?? 120;
  const num = state.transport?.timeSignature?.[0] ?? 4;
  const den = state.transport?.timeSignature?.[1] ?? 4;
  const drumsTrack = getDrumsTrack(state);
  const drumsChannel = drumsTrack?.channel ?? {};
  const masterVol = state.mixer?.master?.volume ?? 1;
  const buses = state.mixer?.buses ?? {};
  const patternBeats = drumsPatternBeats(state);
  const notes = collectDrumNoteList(state);
  const loopSlots = collectLoopExportSlots(state);
  const beatSec = beatSeconds(state.transport);
  const drumSends = averageDrumSends(state);

  const tempoId = nextId();
  const tsId = nextId();
  const drumsTrackId = nextId();
  const drumsChanId = nextId();
  const loopTrackMeta = loopSlots.map((slot) => ({
    ...slot,
    trackId: nextId(),
    chanId: nextId(),
  }));
  const reverbTrackId = nextId();
  const reverbChanId = nextId();
  const delayTrackId = nextId();
  const delayChanId = nextId();
  const masterTrackId = nextId();
  const masterChanId = nextId();
  const arrangementId = nextId();
  const arrangementLanesId = nextId();
  const sceneId = nextId();
  const sceneLanesId = nextId();

  const sendDest = { reverb: reverbChanId, delay: delayChanId };

  const reverbComment = `Grooves reverb bus (seconds=${buses.reverb?.seconds ?? 3}, decay=${buses.reverb?.decay ?? 2}); add FX in host.`;
  const delayComment = `Grooves delay bus (time=${buses.delay?.time ?? 0.375}s, feedback=${buses.delay?.feedback ?? 0.35}); add FX in host.`;

  const structureTracks = [
    [
      `<Track contentType="notes" loaded="true" id="${esc(drumsTrackId)}" name="${esc(drumsTrack?.name || 'Drums')}">`,
      indentBlock(
        channelXml({
          id: drumsChanId,
          nextId,
          role: 'regular',
          destination: masterChanId,
          volume: drumsChannel.volume ?? 1,
          pan: drumsChannel.pan ?? 0.5,
          muted: !!drumsChannel.muted,
          solo: !!drumsChannel.solo,
          sendsBlockXml: sendsXml(nextId, drumSends, sendDest),
        }),
        2,
      ),
      `</Track>`,
    ].join('\n'),
    ...loopTrackMeta.map((slot) =>
      [
        `<Track contentType="audio" loaded="true" id="${esc(slot.trackId)}" name="${esc(slot.name)}">`,
        indentBlock(
          channelXml({
            id: slot.chanId,
            nextId,
            role: 'regular',
            destination: masterChanId,
            volume: slot.volume,
            pan: slot.pan,
            muted: slot.muted,
            solo: false,
            devicesXml: equalizerFromVcfXml(nextId, slot.vcf),
            sendsBlockXml: sendsXml(nextId, slot.sends, sendDest),
          }),
          2,
        ),
        `</Track>`,
      ].join('\n'),
    ),
    [
      `<Track contentType="audio" loaded="true" id="${esc(reverbTrackId)}" name="Reverb">`,
      indentBlock(
        channelXml({
          id: reverbChanId,
          nextId,
          role: 'effect',
          destination: masterChanId,
          volume: 1,
          pan: 0.5,
          muted: false,
          solo: false,
          comment: reverbComment,
        }),
        2,
      ),
      `</Track>`,
    ].join('\n'),
    [
      `<Track contentType="audio" loaded="true" id="${esc(delayTrackId)}" name="Delay">`,
      indentBlock(
        channelXml({
          id: delayChanId,
          nextId,
          role: 'effect',
          destination: masterChanId,
          volume: 1,
          pan: 0.5,
          muted: false,
          solo: false,
          comment: delayComment,
        }),
        2,
      ),
      `</Track>`,
    ].join('\n'),
    [
      `<Track contentType="audio notes" loaded="true" id="${esc(masterTrackId)}" name="Master">`,
      indentBlock(
        channelXml({
          id: masterChanId,
          nextId,
          role: 'master',
          volume: masterVol,
          pan: 0.5,
          muted: false,
          solo: false,
        }),
        2,
      ),
      `</Track>`,
    ].join('\n'),
  ];

  const notesId = nextId();
  const noteLines = notes.map(
    (n) =>
      `<Note time="${fmt(n.time)}" duration="${fmt(n.duration)}" channel="0" key="${n.key}" vel="${fmt(n.vel)}" rel="${fmt(n.vel)}"/>`,
  );
  const drumsClipSlotId = nextId();
  const drumsClipXml = [
    `<ClipSlot track="${esc(drumsTrackId)}" id="${esc(drumsClipSlotId)}">`,
    `  <Clip time="0" duration="${fmt(patternBeats)}" playStart="0" name="${esc(drumsTrack?.name || 'Drums')}">`,
    `    <Notes id="${esc(notesId)}">`,
    ...noteLines.map((line) => `      ${line}`),
    `    </Notes>`,
    `  </Clip>`,
    `</ClipSlot>`,
  ].join('\n');

  const loopClipSlots = loopTrackMeta.map((slot) => {
    const clipSlotId = nextId();
    const warpsId = nextId();
    const audioId = nextId();
    const durationBeats = Math.max(beatSec > 0 ? slot.durationSec / beatSec : 0, 0.001);
    const channels = slot.buffer.numberOfChannels || 2;
    const sampleRate = slot.buffer.sampleRate || 44100;
    return [
      `<ClipSlot track="${esc(slot.trackId)}" id="${esc(clipSlotId)}">`,
      `  <Clip time="0" duration="${fmt(durationBeats)}" playStart="0" name="${esc(slot.name)}">`,
      `    <Warps contentTimeUnit="seconds" timeUnit="beats" id="${esc(warpsId)}">`,
      `      <Audio algorithm="stretch" channels="${channels}" duration="${fmt(slot.durationSec)}" sampleRate="${sampleRate}" id="${esc(audioId)}">`,
      `        <File path="${esc(slot.path)}"/>`,
      `      </Audio>`,
      `      <Warp time="0" contentTime="0"/>`,
      `      <Warp time="${fmt(durationBeats)}" contentTime="${fmt(slot.durationSec)}"/>`,
      `    </Warps>`,
      `  </Clip>`,
      `</ClipSlot>`,
    ].join('\n');
  });

  const xml = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Project version="${esc(PROJECT_FORMAT_VERSION)}">`,
    `  <Application name="${esc(APP_NAME)}" version="${esc(APP_VERSION)}"/>`,
    `  <Transport>`,
    `    <Tempo max="666.0" min="20.0" unit="bpm" value="${fmt(bpm)}" id="${esc(tempoId)}" name="Tempo"/>`,
    `    <TimeSignature denominator="${Number(den) || 4}" numerator="${Number(num) || 4}" id="${esc(tsId)}"/>`,
    `  </Transport>`,
    `  <Structure>`,
    ...structureTracks.map((block) => indentBlock(block, 4)),
    `  </Structure>`,
    `  <Arrangement id="${esc(arrangementId)}">`,
    `    <Lanes timeUnit="beats" id="${esc(arrangementLanesId)}"/>`,
    `  </Arrangement>`,
    `  <Scenes>`,
    `    <Scene name="A" id="${esc(sceneId)}">`,
    `      <Lanes timeUnit="beats" id="${esc(sceneLanesId)}">`,
    indentBlock(drumsClipXml, 8),
    ...loopClipSlots.map((block) => indentBlock(block, 8)),
    `      </Lanes>`,
    `    </Scene>`,
    `  </Scenes>`,
    `</Project>`,
    ``,
  ].join('\n');

  return {
    xml,
    media: loopTrackMeta.map(({ path, buffer }) => ({ path, buffer })),
  };
};

/** Pack a `.dawproject` ZIP Blob (project.xml + metadata.xml + loop WAVs). */
export const packDawproject = async (state) => {
  const { xml, media } = buildDawprojectXml(state);
  const zip = new JSZip();
  zip.file('project.xml', xml);
  zip.file('metadata.xml', buildMetadataXml(state));

  await Promise.all(
    media.map(async ({ path, buffer }) => {
      const wav = bufferToWav(buffer);
      zip.file(path, await wav.arrayBuffer());
    }),
  );

  return zip.generateAsync({ type: 'blob' });
};
