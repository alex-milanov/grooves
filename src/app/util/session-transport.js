import { dispatch } from 'iblokz-state';
import { context } from './audio';
import { getLoopsTrack, mapLoopSlots, slotHasContent } from './loops-state';
import {
  getTransportStartTime,
  nextTransportStart,
  resetTransportStartTime,
  setTransportStartTime,
} from './transport-clock';

export const DRUMS_TRACK_ID = 'drums';
export const LOOPS_TRACK_ID = 'trk-loops';

const ACTIVE_LOOP_PROCESSES = new Set(['play', 'record', 'overdub']);

export const isTrackScheduling = (state, trackId = DRUMS_TRACK_ID) => {
  const track = state.tracks?.find((t) => t.id === trackId);
  return !!track?.transport?.playing;
};

export const isLoopsScheduling = (state) => isTrackScheduling(state, LOOPS_TRACK_ID);

export const anyTrackScheduling = (state) =>
  state.tracks?.some((t) => t.transport?.playing) ?? false;

export const anyLoopSlotActive = (state) =>
  getLoopsTrack(state)?.loop?.slots?.some((slot) => ACTIVE_LOOP_PROCESSES.has(slot.process)) ??
  false;

/** True when session transport, a track transport, or any loop slot is running. */
export const anySessionActivity = (state) => {
  if (state.transport?.playing) return true;
  if (state.tracks?.some((t) => t.transport?.playing)) return true;
  return anyLoopSlotActive(state);
};

/**
 * True when there is already a musical cycle underway to join mid-bar.
 * Transport/track `playing` alone does not count — those flags flip before audio is armed,
 * which would wrongly treat a cold start as a mid-cycle join.
 */
export const hasRunningCycle = (state, excludeSlotIndex = null) => {
  const slots = getLoopsTrack(state)?.loop?.slots ?? [];
  if (slots.some((s, i) => i !== excludeSlotIndex && ACTIVE_LOOP_PROCESSES.has(s.process))) {
    return true;
  }

  const start = getTransportStartTime();
  const drumsOrSession = !!state.transport?.playing || isTrackScheduling(state, DRUMS_TRACK_ID);
  // Only join once the shared transport anchor is in the past (audio underway).
  return drumsOrSession && start > 0 && context.currentTime >= start;
};

const stopLoopSlots = (state) =>
  mapLoopSlots(state, (slot) => {
    if (slot.process === 'empty') return slot;
    return {
      ...slot,
      process: slotHasContent(slot) ? 'idle' : 'empty',
      startedAt: null,
      countInAt: null,
      countInSilent: false,
      partialPlay: false,
      leadPadSeconds: 0,
    };
  });

const mapTrackTransport = (tracks, id, fn) =>
  (tracks ?? []).map((t) => (t.id === id ? { ...t, transport: fn(t.transport ?? {}) } : t));

const startAllTrackTransports = (tracks) =>
  (tracks ?? []).map((t) =>
    t.transport?.armed === false
      ? t
      : { ...t, transport: { ...t.transport, playing: true, stopPending: false } },
  );

const stopAllTrackTransports = (tracks, { stopPending = false } = {}) =>
  (tracks ?? []).map((t) => ({
    ...t,
    transport: { ...t.transport, playing: false, stopPending },
  }));

/** Session play/pause — all armed tracks follow session transport. */
export const sessionTogglePlay = () =>
  dispatch((s) => {
    const nextPlaying = !s.transport?.playing;
    if (nextPlaying) {
      // Shared downbeat for drums + loops before either service schedules audio.
      setTransportStartTime(nextTransportStart());
      return {
        ...s,
        transport: { ...s.transport, playing: true, stopPending: false },
        tracks: startAllTrackTransports(s.tracks),
      };
    }
    return {
      ...s,
      transport: { ...s.transport, playing: false, playhead: null, stopPending: false },
      tracks: stopAllTrackTransports(s.tracks),
    };
  });

/** Session stop — halts session and every track (including loop slots). */
export const sessionStop = () =>
  dispatch((s) => {
    resetTransportStartTime();
    return stopLoopSlots({
      ...s,
      transport: {
        ...s.transport,
        playing: false,
        playhead: null,
        stopPending: true,
      },
      tracks: stopAllTrackTransports(s.tracks),
    });
  });

/** Per-track play/pause — does not change session transport. */
export const trackTogglePlay = (trackId = DRUMS_TRACK_ID) =>
  dispatch((s) => {
    const track = s.tracks?.find((t) => t.id === trackId);
    if (!track) return s;

    const nextTrackPlaying = !track.transport?.playing;
    if (nextTrackPlaying && trackId === DRUMS_TRACK_ID && getTransportStartTime() <= 0) {
      setTransportStartTime(nextTransportStart());
    }

    return {
      ...s,
      tracks: mapTrackTransport(s.tracks, trackId, (tr) => ({
        ...tr,
        playing: nextTrackPlaying,
        stopPending: false,
      })),
    };
  });

/** Per-track stop — does not change session transport. */
export const trackStop = (trackId = DRUMS_TRACK_ID) =>
  dispatch((s) => {
    if (trackId === DRUMS_TRACK_ID && !anyLoopSlotActive(s)) {
      resetTransportStartTime();
    }
    return {
      ...s,
      tracks: mapTrackTransport(s.tracks, trackId, (tr) => ({
        ...tr,
        playing: false,
        stopPending: true,
      })),
    };
  });
