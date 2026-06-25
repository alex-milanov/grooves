import { dispatch } from 'iblokz-state';
import { context } from './audio';
import { quantizeTargetSeconds, trimPadBuffer } from './loop-quantize';
import { barSeconds } from './transport-clock';
import * as samples from './samples';
import {
  createEmptySlot,
  getLoopSlot,
  getLoopsTrack,
  LOOPS_SLOT_COUNT,
  loopBufferKey,
  mapLoopSlots,
  patchLoopSlot,
  patchLoopsTrack,
  slotHasContent,
} from './loops-state';
import {
  deselectLoopSlot,
  openLoopLibraryPanel,
  panelsAfterLoopAssign,
  selectLoopSlot as selectSlotState,
} from './loops-panels';
import {
  DEFAULT_LOOP_SOURCE_BPM,
  loopPlaybackDuration,
} from './loop-tempo';
import { nextSlotCycleTime } from './transport-clock';
import { LOOPS_KIT_NAME } from '../services/loops-library';
import { emptySlotRecordSchedule, slotPlaySchedule } from './loop-record-schedule';
import { LOOPS_TRACK_ID } from './session-transport';

export const selectLoopSlot = (slotIndex) => dispatch((s) => selectSlotState(s, slotIndex));

export const setLoopsInput = (inputId) => dispatch((s) => patchLoopsTrack(s, { inputId }));

export const toggleLoopsClick = () =>
  dispatch((s) => {
    const track = getLoopsTrack(s);
    if (!track) return s;
    return patchLoopsTrack(s, { clickEnabled: !track.loop?.clickEnabled });
  });

export const slotTogglePlayRec = (slotIndex) =>
  dispatch((s) => {
    const slot = getLoopSlot(s, slotIndex);
    if (!slot) return s;

    const process = slot.process;
    const track = getLoopsTrack(s);
    const clickOn = !!track?.loop?.clickEnabled;

    if (process === 'record' || process === 'overdub') {
      return patchLoopSlot(s, slotIndex, { process: 'play' });
    }

    if (process === 'empty') {
      const schedule = emptySlotRecordSchedule(s, clickOn);
      return patchLoopSlot(s, slotIndex, {
        process: 'record',
        ...schedule,
      });
    }

    if (process === 'play') {
      const recordAt = nextSlotCycleTime(slot.startedAt, slot.duration);
      return patchLoopSlot(s, slotIndex, {
        process: 'overdub',
        startedAt: recordAt,
      });
    }

    if (process === 'idle' && slotHasContent(slot)) {
      const schedule = slotPlaySchedule(s, slotIndex);
      return patchLoopSlot(s, slotIndex, {
        process: 'play',
        ...schedule,
      });
    }

    return s;
  });

export const slotStop = (slotIndex) =>
  dispatch((s) => {
    const slot = getLoopSlot(s, slotIndex);
    if (!slot || slot.process === 'empty') return s;
    return patchLoopSlot(s, slotIndex, {
      process: slotHasContent(slot) ? 'idle' : 'empty',
      countInAt: null,
      countInSilent: false,
      partialPlay: false,
    });
  });

export const slotClear = (slotIndex) =>
  dispatch((s) =>
    patchLoopSlot(s, slotIndex, {
      ...createEmptySlot(slotIndex),
      id: `slot-${slotIndex}`,
    }),
  );

export const loopsTogglePlay = () =>
  dispatch((s) => {
    const loopsTrack = getLoopsTrack(s);
    if (!loopsTrack) return s;
    if (loopsTrack.transport?.playing) {
      return {
        ...mapLoopSlots(s, (slot) =>
          ['play', 'record', 'overdub'].includes(slot.process)
            ? { ...slot, process: slotHasContent(slot) ? 'idle' : 'empty', countInAt: null, countInSilent: false, partialPlay: false }
            : slot,
        ),
        tracks: s.tracks.map((t) =>
          t.id === LOOPS_TRACK_ID
            ? { ...t, transport: { ...t.transport, playing: false, stopPending: false } }
            : t,
        ),
      };
    }
    const schedule = slotPlaySchedule(s);
    const withSlots = mapLoopSlots(s, (slot) =>
      slotHasContent(slot) ? { ...slot, process: 'play', ...schedule } : slot,
    );
    return {
      ...withSlots,
      tracks: withSlots.tracks.map((t) =>
        t.id === LOOPS_TRACK_ID
          ? { ...t, transport: { ...t.transport, playing: true, stopPending: false } }
          : t,
      ),
    };
  });

export const loopsStopAll = () =>
  dispatch((s) => ({
    ...mapLoopSlots(s, (slot) =>
      slot.process === 'empty'
        ? slot
        : { ...slot, process: 'idle', countInAt: null, countInSilent: false, partialPlay: false },
    ),
    tracks: s.tracks.map((t) =>
      t.id === LOOPS_TRACK_ID
        ? { ...t, transport: { ...t.transport, playing: false, stopPending: true } }
        : t,
    ),
  }));

export const loopsClearAll = () =>
  dispatch((s) =>
    patchLoopsTrack(
      mapLoopSlots(s, (_, i) => ({
        ...createEmptySlot(i),
        id: `slot-${i}`,
      })),
    ),
  );

export const assignLoopSample = (slotIndex, kit, sample) =>
  dispatch((s) => {
    const kitName = kit ?? LOOPS_KIT_NAME;
    const buffer = samples.get(samples.key(kitName, sample));
    if (!buffer) {
      console.warn('loop sample not loaded:', kitName, sample);
      return s;
    }

    const target = quantizeTargetSeconds(buffer.duration, barSeconds(s.transport));
    const trimmed = trimPadBuffer(context, buffer, target);
    const key = loopBufferKey(slotIndex, 0);
    samples.set(key, trimmed);

    return {
      ...patchLoopSlot(s, slotIndex, {
        bufferKeys: [key],
        sourceBpm: DEFAULT_LOOP_SOURCE_BPM,
        sourceBpms: [DEFAULT_LOOP_SOURCE_BPM],
        duration: loopPlaybackDuration(trimmed.duration, DEFAULT_LOOP_SOURCE_BPM, s.transport),
        layers: 1,
        process: 'idle',
        kit: kitName,
        sample,
      }),
      ui: {
        ...s.ui,
        loops: {
          ...s.ui.loops,
          selectedSlot: slotIndex,
          panels: panelsAfterLoopAssign(s),
        },
      },
      loopsLibrary: {
        ...s.loopsLibrary,
        selectedSample: sample,
      },
    };
  });

export const patchSlotParam = (slotIndex, path, value) =>
  dispatch((s) => {
    const slot = getLoopSlot(s, slotIndex);
    if (!slot) return s;
    const params = { ...slot.params };
    if (path.length === 1) {
      params[path[0]] = value;
    } else if (path[0] === 'vcf' || path[0] === 'sends') {
      params[path[0]] = { ...params[path[0]], [path[1]]: value };
    }
    return patchLoopSlot(s, slotIndex, { params });
  });

export { deselectLoopSlot, openLoopLibraryPanel };

export const loopsSlotIndices = () => Array.from({ length: LOOPS_SLOT_COUNT }, (_, i) => i);
