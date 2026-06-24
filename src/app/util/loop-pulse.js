import { context } from './audio';
import { barSeconds, beatSeconds, getTransportStartTime } from './transport-clock';
import { getLoopsTrack } from './loops-state';

const ACTIVE_PROCESSES = new Set(['play', 'record', 'overdub']);

/** Whether the slot circle should pulse to the current BPM. */
export const slotTempoPulseEnabled = (state, slot, slotIndex) => {
  const process = slot?.process;
  if (!ACTIVE_PROCESSES.has(process)) return false;

  if (process === 'record' && getTransportStartTime() <= 0) {
    const sessionPlaying = !!state.transport?.playing;
    const trackPlaying = state.tracks?.some((t) => t.transport?.playing);
    const otherSlot = getLoopsTrack(state)?.loop?.slots?.some(
      (s, i) => i !== slotIndex && ACTIVE_PROCESSES.has(s.process),
    );
    if (!sessionPlaying && !trackPlaying && !otherSlot) return false;
  }

  return true;
};

/** Phase within the current quarter-note beat (0 = downbeat). */
export const beatPhaseAt = (transport, atTime = context.currentTime, slot = null) => {
  const beat = beatSeconds(transport);
  if (!beat) return 0;
  const bar = barSeconds(transport);

  const slotAnchor =
    slot?.startedAt != null && slot.startedAt <= atTime + 0.001 && bar > 0 ? slot.startedAt : null;

  if (slotAnchor != null) {
    const intoBar = (((atTime - slotAnchor) % bar) + bar) % bar;
    return (intoBar % beat) / beat;
  }

  const start = getTransportStartTime();
  if (start > 0 && bar > 0) {
    const intoBar = (((atTime - start) % bar) + bar) % bar;
    return (intoBar % beat) / beat;
  }

  return (((atTime % beat) + beat) % beat) / beat;
};

/** Subtle scale bump peaking on the downbeat. */
export const beatPulseScale = (phase) => {
  const attack = 0.22;
  if (phase < 0 || phase >= attack) return 1;
  return 1 + 0.022 * (1 - phase / attack);
};

export const applyTempoPulseToButton = (btn, state, slot, slotIndex) => {
  if (!btn) return;
  const pulse = slotTempoPulseEnabled(state, slot, slotIndex);
  btn.classList.toggle('tempo-pulse', pulse);
  if (pulse) {
    const phase = beatPhaseAt(state.transport, context.currentTime, slot);
    btn.style.transform = `scale(${beatPulseScale(phase)})`;
  } else {
    btn.style.removeProperty('transform');
  }
};
