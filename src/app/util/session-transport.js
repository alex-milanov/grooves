import { dispatch } from 'iblokz-state';

export const DRUMS_TRACK_ID = 'drums';

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
  dispatch((s) => ({
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
  }));

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

export const anyTrackScheduling = (state) =>
  !!state.transport?.playing && state.tracks?.some((t) => t.transport?.playing);
