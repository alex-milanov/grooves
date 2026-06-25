import { context } from './audio';
import { barSeconds, beatSeconds, getTransportStartTime } from './transport-clock';

const PULSE_PROCESSES = new Set(['play', 'overdub']);

/** Whether the slot circle should pulse to the current BPM. */
export const slotTempoPulseEnabled = (state, slot) => {
  const process = slot?.process;
  return PULSE_PROCESSES.has(process);
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
