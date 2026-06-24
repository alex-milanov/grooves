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

const stopLoopSlots = (state) =>
  mapLoopSlots(state, (slot) => {
    if (slot.process === 'empty') return slot;
    return {
      ...slot,
      process: slotHasContent(slot) ? 'idle' : 'empty',
      countInAt: null,
      countInSilent: false,
    };
  });

const mapTrackTransport = (tracks, id, fn) =>
  (tracks ?? []).map((t) => (t.id === id ? { ...t, transport: fn(t.transport ?? {}) } : t));

/** Session stops when no track schedulers remain active. */
export const syncSessionFromTracks = (state) => {
  if (!state.transport?.playing) return state;
  const anyPlaying = state.tracks?.some((t) => t.transport?.playing);
  if (anyPlaying) return state;
  return {
    ...state,
    transport: {
      ...state.transport,
      playing: false,
      playhead: null,
      stopPending: false,
    },
  };
};

export const sessionTogglePlay = () =>
  dispatch((s) => {
    const nextPlaying = !s.transport?.playing;
    if (nextPlaying) {
      return {
        ...s,
        transport: { ...s.transport, playing: true, stopPending: false },
        tracks: (s.tracks ?? []).map((t) =>
          t.transport?.armed === false
            ? t
            : { ...t, transport: { ...t.transport, playing: true, stopPending: false } },
        ),
      };
    }
    return {
      ...s,
      transport: { ...s.transport, playing: false, playhead: null, stopPending: false },
      tracks: (s.tracks ?? []).map((t) => ({
        ...t,
        transport: { ...t.transport, playing: false, stopPending: false },
      })),
    };
  });

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
      tracks: (s.tracks ?? []).map((t) => ({
        ...t,
        transport: { ...t.transport, playing: false, stopPending: false },
      })),
    }),
  );

export const trackTogglePlay = (trackId = DRUMS_TRACK_ID) =>
  dispatch((s) => {
    const track = s.tracks?.find((t) => t.id === trackId);
    if (!track) return s;

    const nextTrackPlaying = !track.transport?.playing;

    if (nextTrackPlaying) {
      return {
        ...s,
        transport: { ...s.transport, playing: true, stopPending: false },
        tracks: mapTrackTransport(s.tracks, trackId, (tr) => ({
          ...tr,
          playing: true,
          stopPending: false,
        })),
      };
    }

    return syncSessionFromTracks({
      ...s,
      tracks: mapTrackTransport(s.tracks, trackId, (tr) => ({
        ...tr,
        playing: false,
        stopPending: false,
      })),
    });
  });

export const trackStop = (trackId = DRUMS_TRACK_ID) =>
  dispatch((s) => {
    const tracks = mapTrackTransport(s.tracks, trackId, (tr) => ({
      ...tr,
      playing: false,
      stopPending: true,
    }));
    const anyPlaying = tracks.some((t) => t.transport?.playing);
    if (anyPlaying) {
      return { ...s, tracks };
    }
    return {
      ...s,
      tracks: tracks.map((t) => ({
        ...t,
        transport: { ...t.transport, stopPending: false },
      })),
      transport: {
        ...s.transport,
        playing: false,
        playhead: null,
        stopPending: true,
      },
    };
  });

export const isTrackScheduling = (state, trackId = DRUMS_TRACK_ID) => {
  if (!state.transport?.playing) return false;
  const track = state.tracks?.find((t) => t.id === trackId);
  return !!track?.transport?.playing;
};

export const isLoopsScheduling = (state) => isTrackScheduling(state, LOOPS_TRACK_ID);

export const anyTrackScheduling = (state) =>
  !!state.transport?.playing && state.tracks?.some((t) => t.transport?.playing);
