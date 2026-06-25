import { dispatch } from 'iblokz-state';
import { getLoopsTrack, mapLoopSlots, slotHasContent } from './loops-state';

export const DRUMS_TRACK_ID = 'drums';
export const LOOPS_TRACK_ID = 'trk-loops';

const ACTIVE_LOOP_PROCESSES = new Set(['play', 'record', 'overdub']);

export const anyLoopSlotActive = (state) =>
  getLoopsTrack(state)?.loop?.slots?.some((slot) => ACTIVE_LOOP_PROCESSES.has(slot.process)) ??
  false;

/** True when session transport, a track transport, or any loop slot is running. */
export const anySessionActivity = (state) => {
  if (state.transport?.playing) return true;
  if (state.tracks?.some((t) => t.transport?.playing)) return true;
  return anyLoopSlotActive(state);
};

/** Running musical cycle excluding a slot being armed (for play join). */
export const hasRunningCycle = (state, excludeSlotIndex = null) => {
  if (state.transport?.playing) return true;
  if (state.tracks?.some((t) => t.transport?.playing)) return true;
  const slots = getLoopsTrack(state)?.loop?.slots ?? [];
  return slots.some(
    (s, i) => i !== excludeSlotIndex && ACTIVE_LOOP_PROCESSES.has(s.process),
  );
};

const stopLoopSlots = (state) =>
  mapLoopSlots(state, (slot) => {
    if (slot.process === 'empty') return slot;
    return {
      ...slot,
      process: slotHasContent(slot) ? 'idle' : 'empty',
      countInAt: null,
      countInSilent: false,
      partialPlay: false,
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
  dispatch((s) =>
    stopLoopSlots({
      ...s,
      transport: {
        ...s.transport,
        playing: false,
        playhead: null,
        stopPending: true,
      },
      tracks: stopAllTrackTransports(s.tracks),
    }),
  );

/** Per-track play/pause — does not change session transport. */
export const trackTogglePlay = (trackId = DRUMS_TRACK_ID) =>
  dispatch((s) => {
    const track = s.tracks?.find((t) => t.id === trackId);
    if (!track) return s;

    const nextTrackPlaying = !track.transport?.playing;

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
  dispatch((s) => ({
    ...s,
    tracks: mapTrackTransport(s.tracks, trackId, (tr) => ({
      ...tr,
      playing: false,
      stopPending: true,
    })),
  }));

export const isTrackScheduling = (state, trackId = DRUMS_TRACK_ID) => {
  const track = state.tracks?.find((t) => t.id === trackId);
  return !!track?.transport?.playing;
};

export const isLoopsScheduling = (state) => isTrackScheduling(state, LOOPS_TRACK_ID);

export const anyTrackScheduling = (state) =>
  state.tracks?.some((t) => t.transport?.playing) ?? false;
