/** Audio engine gate (autoplay / AudioContext suspension). */

export const initialAudio = () => ({
  /** True while AudioContext cannot play until a user gesture. */
  blocked: false,
});

export const setAudioBlocked = (blocked) => (state) => {
  const next = !!blocked;
  if (!!state.audio?.blocked === next) return state;
  return {
    ...state,
    audio: { ...(state.audio ?? initialAudio()), blocked: next },
  };
};

export default { initialAudio, setAudioBlocked };
