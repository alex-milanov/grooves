import { obj } from 'iblokz-data';

export const SETTINGS_TAB_RECORDING = 'recording';
export const SETTINGS_TAB_MIDI = 'midi';
export const SETTINGS_TAB_AUDIO = 'audio';
export const SETTINGS_TAB_SESSION = 'session';

/** Input trim range (dB). 0 = unity (~⅓ on a linear −12…+24 slider). */
export const INPUT_GAIN_DB_MIN = -12;
export const INPUT_GAIN_DB_MAX = 24;

export const initialSettings = () => ({
  tab: SETTINGS_TAB_RECORDING,
  recording: {
    /** Input trim in dB (0 = unity). */
    inputGainDb: 0,
  },
});

export const setSettingsTab = (tab) => (state) => obj.patch(state, ['settings', 'tab'], tab);

export const setRecordingInputGainDb = (value) => (state) =>
  obj.patch(
    state,
    ['settings', 'recording', 'inputGainDb'],
    Math.min(INPUT_GAIN_DB_MAX, Math.max(INPUT_GAIN_DB_MIN, value)),
  );
