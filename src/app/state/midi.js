/** MIDI controller input state (devices stubs + selection). */

import { obj } from 'iblokz-data';

export const MIDI_INPUT_ANY = '-1';
export const MIDI_SCHEME_MPK_MINI_IV = 'mpk-mini-iv';

export const initialMidi = () => ({
  supported: null, // null | true | false
  accessError: null,
  inputId: MIDI_INPUT_ANY,
  scheme: MIDI_SCHEME_MPK_MINI_IV,
  devices: { inputs: [], outputs: [] },
});

const deviceStub = (d) => ({ id: d.id, name: d.name || d.id });

export const setMidiSupported = (supported) => (state) =>
  obj.patch(state, 'midi', {
    ...(state.midi ?? initialMidi()),
    supported,
    accessError: supported ? null : (state.midi?.accessError ?? null),
  });

export const setMidiAccessError = (accessError) => (state) =>
  obj.patch(state, 'midi', {
    ...(state.midi ?? initialMidi()),
    supported: false,
    accessError: accessError ? String(accessError.message || accessError) : null,
  });

/** Replace device stub lists from Web MIDI access (no live MIDIInput objects). */
export const connectMidiDevices =
  ({ inputs = [], outputs = [] }) =>
  (state) =>
    obj.patch(state, 'midi', {
      ...(state.midi ?? initialMidi()),
      devices: {
        inputs: inputs.map(deviceStub),
        outputs: outputs.map(deviceStub),
      },
    });

export const setMidiInputId = (inputId) => (state) =>
  obj.patch(state, 'midi', {
    ...(state.midi ?? initialMidi()),
    inputId: inputId == null ? MIDI_INPUT_ANY : String(inputId),
  });

export const setMidiScheme = (scheme) => (state) =>
  obj.patch(state, 'midi', {
    ...(state.midi ?? initialMidi()),
    scheme: scheme || MIDI_SCHEME_MPK_MINI_IV,
  });

/** Prefer MPK Mini IV performance port (ignore DAW / Plugin / Din). */
export const preferMidiInput = (inputs) =>
  inputs.find((d) => /MPK Mini IV MIDI Port/i.test(d.name)) ??
  inputs.find((d) => /MPK Mini IV/i.test(d.name) && !/DAW|Plugin|Software|Din/i.test(d.name)) ??
  null;

/**
 * Transport / screen controls live on DAW Port (or generic Software Control),
 * not the performance MIDI Port.
 */
export const isMpkDawControlPort = (name = '') =>
  /DAW Port|Software Control/i.test(name);

export default {
  initialMidi,
  setMidiSupported,
  setMidiAccessError,
  connectMidiDevices,
  setMidiInputId,
  setMidiScheme,
  preferMidiInput,
  isMpkDawControlPort,
  MIDI_INPUT_ANY,
  MIDI_SCHEME_MPK_MINI_IV,
};
