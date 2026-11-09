/**
 * Web MIDI controller input — scheme dispatch + sequencer record.
 * See planning/2026-11-08-03-midi-controller-input.md
 */

import { buffer, debounceTime, filter, map, share, throttleTime, withLatestFrom } from 'rxjs';
import { dispatch } from 'iblokz-state';
import { patch } from '../state';
import {
  connectMidiDevices,
  isMpkDawControlPort,
  MIDI_INPUT_ANY,
  MIDI_SCHEME_MPK_MINI_IV,
  preferMidiInput,
  setMidiAccessError,
  setMidiInputId,
  setMidiSupported,
} from '../state/midi';
import {
  getDrumsRows,
  isDrumsRecording,
  patchDrumRowNested,
  rowSample,
  toggleDrumsRecording,
} from '../state/drums';
import { assignRowSample, selectRow, togglePanel } from '../state/sequencer';
import { setMeasureStep } from '../state/sequencer-measures';
import {
  DRUMS_TRACK_ID,
  isTrackScheduling,
  sessionStop,
  sessionTogglePlay,
} from '../state/transport';
import {
  assignLoopSample,
  DEFAULT_LOOP_SOURCE_BPM,
  LOOPS_SLOT_COUNT,
  loopBufferKey,
  loopPlaybackDuration,
  patchSlotParam,
  selectLoopSlot,
  slotClear,
  slotStop,
  slotTogglePlayRec,
  toggleLoopPanel,
} from '../state/loops';
import { isLoopsWorkspace } from '../state/ui';
import {
  activateLibraryFocus,
  ensureLibrarySection,
  LOOPS_SECTION,
  relativeCcDelta,
  SAMPLES_SECTION,
  stepLibraryFocus,
} from '../util/library';
import { quantizeTargetSeconds, trimPadBuffer } from '../util/loop-quantize';
import { barSeconds } from '../util/transport-clock';
import { init as midiInit, parseMidiMsg } from '../util/midi';
import { context, play, resume, samples, whenRunning } from './audio';
import { getDrumsRecordTiming } from './sequencer';
import mpkMiniIv from './midi/maps/mpk-mini-iv';

const SCHEMES = {
  [MIDI_SCHEME_MPK_MINI_IV]: mpkMiniIv,
};

const CC_THROTTLE_MS = 10;
const DBL_MS = 250;
const TRANSPORT_DEBOUNCE_MS = 350;

let state$Ref = null;
let didAutoConnect = false;
let lastTransportAt = 0;

const schemeOf = (state) => SCHEMES[state.midi?.scheme] ?? mpkMiniIv;

const noteKey = (channel, number) => `${channel}:${number}`;
const ccKey = (channel, controller) => `${channel}:${controller}`;

const scale = (value, min, max) => min + value * (max - min);

/** Compact one-line MIDI debug for the JS console. */
const formatMidiDebug = (msg, inputName) => {
  const src = inputName ? ` ← ${inputName}` : '';
  if (msg.state === 'noteOn' || msg.state === 'noteOff') {
    const n = msg.note;
    const vel = msg.velocity != null ? ` vel=${msg.velocity}` : '';
    return `${msg.state} ch${msg.channel} ${n.key}${n.octave} (${n.number})${vel}${src}`;
  }
  if (msg.state === 'controller') {
    return `cc ch${msg.channel} #${msg.controller}=${msg.value}${src}`;
  }
  return `${msg.state} ch${msg.channel}${src}`;
};

const acceptTransport = () => {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastTransportAt < TRANSPORT_DEBOUNCE_MS) return false;
  lastTransportAt = now;
  return true;
};

const inputAllowed = (state, input) => {
  // Transport buttons never appear on the performance MIDI Port — always hear DAW Port.
  if (isMpkDawControlPort(input?.name)) return true;
  const id = state.midi?.inputId ?? MIDI_INPUT_ANY;
  return id === MIDI_INPUT_ANY || input?.id === id;
};

/** First drum row whose midi.note matches (wins over scheme loop bindings). */
export const findRowByMidiNote = (state, noteNumber) => {
  const rows = getDrumsRows(state) ?? [];
  return rows.findIndex((row) => row?.midi?.note === noteNumber);
};

const hasRunningGrid = (state) =>
  isTrackScheduling(state, DRUMS_TRACK_ID) && (state.transport?.startTime ?? 0) > 0;

const previewDrumRow = (state, row) => {
  const assignment = rowSample(getDrumsRows(state)?.[row]);
  if (!assignment) return;
  const buffer = samples.get(samples.key(assignment.kit, assignment.sample));
  if (!buffer) return;
  // Play sync when context is already running — resume().then() added a microtask every hit.
  whenRunning(() => {
    play(buffer, context.currentTime, row, { preview: true });
  });
};

const runDrumHit = (state, row, { velocity } = {}) => {
  void velocity;
  // Audio first — recording dispatch can sync a lot of UI/sequencer work before play.
  previewDrumRow(state, row);
  if (isDrumsRecording(state) && hasRunningGrid(state)) {
    // Audio-clock step (not UI/heard playhead) — matches jam-station; UI latency was early.
    const timing = getDrumsRecordTiming(state);
    if (timing?.playhead != null) {
      dispatch(setMeasureStep(timing.playBar, row, timing.playhead, true));
    }
  }
};

/** Prev/next selection in the active sequencer (drum row or loop slot). */
const stepWorkspaceSelection = (state, delta) => {
  if (isLoopsWorkspace(state)) {
    const count = LOOPS_SLOT_COUNT;
    if (count <= 0) return;
    const cur = state.ui?.loops?.selectedSlot;
    // First action with nothing selected → land on slot 0 (ignore delta).
    if (cur == null) {
      dispatch(selectLoopSlot(0));
      return;
    }
    dispatch(selectLoopSlot((cur + delta + count * 10) % count));
    return;
  }

  const rows = getDrumsRows(state) ?? [];
  const count = rows.length;
  if (count <= 0) return;
  const cur = state.ui?.drums?.selectedRow;
  if (cur == null) {
    dispatch(selectRow(0));
    return;
  }
  dispatch(selectRow((cur + delta + count * 10) % count));
};

const toggleWorkspacePanel = (state, panel) => {
  if (isLoopsWorkspace(state)) {
    dispatch(toggleLoopPanel(panel));
    return;
  }
  dispatch(togglePanel(panel));
};

/** Patch FX on the selected loop slot or drum row (selects 0 if none). */
const patchSelectionParam = (state, path, value) => {
  if (isLoopsWorkspace(state)) {
    let slot = state.ui?.loops?.selectedSlot;
    if (slot == null) {
      dispatch(selectLoopSlot(0));
      slot = 0;
    }
    dispatch(patchSlotParam(slot, path, value));
    return;
  }

  let row = state.ui?.drums?.selectedRow;
  if (row == null) {
    dispatch(selectRow(0));
    row = 0;
  }
  dispatch(patchDrumRowNested(row, path, value));
};

const assignLoopFromLibrary = (slotIndex, kit, sample) => {
  const buffer = samples.get(samples.key(kit, sample));
  if (!buffer) {
    console.warn('midi: loop sample not loaded', kit, sample);
    return;
  }
  dispatch((s) => {
    const targetSeconds = quantizeTargetSeconds(buffer.duration, barSeconds(s.transport));
    const trimmed = trimPadBuffer(context, buffer, targetSeconds);
    const key = loopBufferKey(slotIndex, 0);
    samples.set(key, trimmed);
    const duration = loopPlaybackDuration(trimmed.duration, DEFAULT_LOOP_SOURCE_BPM, s.transport);
    return assignLoopSample(slotIndex, {
      bufferKey: key,
      sourceBpm: DEFAULT_LOOP_SOURCE_BPM,
      duration,
      kit,
      sample,
    })(s);
  });
};

/** Open library for the active workspace and ensure the right section. */
const openLibraryForWorkspace = (state) => {
  if (isLoopsWorkspace(state)) {
    let next = state.ui?.loops?.selectedSlot == null ? selectLoopSlot(0)(state) : state;
    const panels = next.ui?.loops?.panels ?? {};
    return {
      ...next,
      ui: {
        ...next.ui,
        loops: {
          ...next.ui.loops,
          panels: {
            ...panels,
            library: true,
            settings: !!panels.settings && !next.viewport?.mobile,
          },
        },
      },
      library: ensureLibrarySection(next.library, LOOPS_SECTION),
    };
  }

  let next = state.ui?.drums?.selectedRow == null ? selectRow(0)(state) : state;
  const panels = next.ui?.drums?.panels ?? {};
  return {
    ...next,
    ui: {
      ...next.ui,
      drums: {
        ...next.ui.drums,
        panels: {
          ...panels,
          library: true,
          settings: !!panels.settings && !next.viewport?.mobile,
        },
      },
    },
    library: ensureLibrarySection(next.library, SAMPLES_SECTION),
  };
};

const browseLibrary = (_state, value) => {
  const delta = relativeCcDelta(value);
  if (!delta) return;
  dispatch((s) => {
    const open = openLibraryForWorkspace(s);
    return { ...open, library: stepLibraryFocus(open.library, delta) };
  });
};

const selectLibraryFocus = (_state) => {
  let assigned = null;
  dispatch((s) => {
    const open = openLibraryForWorkspace(s);
    const { library, sample } = activateLibraryFocus(open.library);
    assigned = sample ?? null;
    return { ...open, library };
  });

  if (!assigned) return;
  const s = state$Ref?.getValue();
  if (!s) return;
  if (isLoopsWorkspace(s)) {
    const slotIndex = s.ui?.loops?.selectedSlot;
    if (slotIndex == null) return;
    assignLoopFromLibrary(slotIndex, assigned.kit, assigned.sample);
    return;
  }
  const row = s.ui?.drums?.selectedRow;
  if (row == null) return;
  dispatch(assignRowSample(row, assigned.kit, assigned.sample));
  previewDrumRow(state$Ref?.getValue() ?? s, row);
};

const runCommand = (state, cmd) => {
  if (!cmd?.type) return;

  switch (cmd.type) {
    case 'session.togglePlay':
      if (!acceptTransport()) return;
      resume().then(() => sessionTogglePlay());
      return;
    case 'session.play':
      if (!acceptTransport()) return;
      resume().then(() => sessionTogglePlay());
      return;
    case 'session.stop':
      if (!acceptTransport()) return;
      sessionStop();
      return;
    case 'loops.playRec':
      resume().then(() => dispatch(slotTogglePlayRec(cmd.slot)));
      return;
    case 'loops.stop':
      dispatch(slotStop(cmd.slot));
      return;
    case 'loops.clear':
      dispatch(slotClear(cmd.slot));
      return;
    case 'drums.preview':
      runDrumHit(state, cmd.row);
      return;
    case 'drums.select':
      dispatch(selectRow(cmd.row));
      return;
    case 'drums.toggleRecord':
      if (!acceptTransport()) return;
      dispatch(toggleDrumsRecording);
      return;
    case 'ui.prev':
      stepWorkspaceSelection(state, -1);
      return;
    case 'ui.next':
      stepWorkspaceSelection(state, 1);
      return;
    case 'ui.toggleLibrary':
      toggleWorkspacePanel(state, 'library');
      return;
    case 'ui.toggleSettings':
      toggleWorkspacePanel(state, 'settings');
      return;
    case 'library.browse':
      browseLibrary(state, cmd.value);
      return;
    case 'library.select':
      selectLibraryFocus(state);
      return;
    case 'selection.volume':
      patchSelectionParam(state, ['volume'], cmd.value);
      return;
    case 'selection.cutoff':
      patchSelectionParam(state, ['vcf', 'cutoff'], cmd.value);
      return;
    case 'selection.resonance':
      patchSelectionParam(state, ['vcf', 'resonance'], cmd.value);
      return;
    case 'selection.reverb':
      patchSelectionParam(state, ['sends', 'reverb'], cmd.value);
      return;
    case 'selection.delay':
      patchSelectionParam(state, ['sends', 'delay'], cmd.value);
      return;
    case 'loops.gain':
      dispatch(patchSlotParam(cmd.slot, ['volume'], cmd.value));
      return;
    case 'mixer.master':
      dispatch(patch(['mixer', 'master', 'volume'], cmd.value));
      return;
    case 'transport.bpm': {
      const min = cmd.min ?? 60;
      const max = cmd.max ?? 200;
      const bpm = Math.round(scale(cmd.value, min, max));
      dispatch(patch(['transport', 'bpm'], bpm));
      return;
    }
    case 'drums.rowGain': {
      const row = state.ui?.drums?.selectedRow;
      if (row == null) return;
      dispatch(patchDrumRowNested(row, ['volume'], cmd.value));
      return;
    }
    case 'drums.vcfCutoff': {
      const row = state.ui?.drums?.selectedRow;
      if (row == null) return;
      dispatch(patchDrumRowNested(row, ['vcf', 'cutoff'], cmd.value));
      return;
    }
    default:
      return;
  }
};

const isBankAPad = (scheme, channel, number) =>
  channel === 10 &&
  number >= (scheme.BANK_A_NOTE_MIN ?? 36) &&
  number <= (scheme.BANK_A_NOTE_MAX ?? 43);

const handleNoteOn = (state, msg, { dbl = false } = {}) => {
  const scheme = schemeOf(state);
  const number = msg.note?.number;
  const channel = msg.channel;
  if (number == null) return;

  if (dbl) {
    const cmd = scheme.dblNotes?.[noteKey(channel, number)];
    if (cmd) runCommand(state, cmd);
    return;
  }

  // Bank A (36–43): fixed scheme map (triggers + UI) — ignore rows[].midi.note.
  if (isBankAPad(scheme, channel, number)) {
    const cmd = scheme.notes?.[noteKey(channel, number)];
    if (cmd) runCommand(state, { ...cmd, velocity: msg.velocity });
    return;
  }

  // Elsewhere: row MIDI note wins (e.g. note 45 → drums over Bank B loop).
  const row = findRowByMidiNote(state, number);
  if (row >= 0) {
    runDrumHit(state, row, { velocity: msg.velocity });
    return;
  }

  const cmd = scheme.notes?.[noteKey(channel, number)];
  if (cmd) runCommand(state, { ...cmd, velocity: msg.velocity });
};

const handleController = (state, msg, inputName) => {
  const scheme = schemeOf(state);
  const key = ccKey(msg.channel, msg.controller);
  const fromDaw = isMpkDawControlPort(inputName);
  const cmd = fromDaw ? scheme.dawControllers?.[key] : scheme.controllers?.[key];
  if (!cmd) return;
  // Hardware transport buttons send press (127) + release (0).
  if (cmd.button && !(msg.value > 0)) return;
  runCommand(state, { ...cmd, value: msg.value });
};

let onStop = () => {};
export const stop = () => onStop();

export const start = ({ state$ }) => {
  stop();

  state$Ref = state$;
  didAutoConnect = false;
  lastTransportAt = 0;
  let subs = [];

  const { devices$, msg$, supported } = midiInit();

  if (!supported) {
    dispatch(setMidiSupported(false));
    onStop = () => {
      state$Ref = null;
      onStop = () => {};
    };
    return;
  }

  dispatch(setMidiSupported(true));

  subs.push(
    devices$.subscribe({
      next: ({ inputs, outputs }) => {
        dispatch(connectMidiDevices({ inputs, outputs }));
        const state = state$Ref?.getValue();
        if (!state) return;
        const preferred = preferMidiInput(inputs);
        const inputId = state.midi?.inputId ?? MIDI_INPUT_ANY;
        if (!didAutoConnect && inputId === MIDI_INPUT_ANY && preferred) {
          didAutoConnect = true;
          dispatch(setMidiInputId(preferred.id));
        } else if (
          inputId !== MIDI_INPUT_ANY &&
          !inputs.some((d) => d.id === inputId) &&
          preferred
        ) {
          dispatch(setMidiInputId(preferred.id));
        }
      },
      error: (err) => {
        dispatch(setMidiAccessError(err));
      },
    }),
  );

  const parsed$ = msg$.pipe(
    map((raw) => ({ msg: parseMidiMsg(raw.msg), raw })),
    filter(({ msg }) => !!msg.state),
    withLatestFrom(state$),
    filter(([{ raw }, state]) => inputAllowed(state, raw.input)),
    map(([{ msg, raw }, state]) => ({ msg, raw, state })),
    share(),
  );

  const noteOn$ = parsed$.pipe(
    filter(({ msg }) => msg.state === 'noteOn'),
    share(),
  );

  subs.push(
    noteOn$.subscribe(({ msg, raw, state }) => {
      handleNoteOn(state, msg, { dbl: false });
      console.debug('[midi]', formatMidiDebug(msg, raw.input?.name));
    }),
  );

  subs.push(
    noteOn$
      .pipe(
        buffer(noteOn$.pipe(debounceTime(DBL_MS))),
        filter(
          (list) =>
            list.length === 2 &&
            list[0].msg.note?.number === list[1].msg.note?.number &&
            list[0].msg.channel === list[1].msg.channel,
        ),
        map((list) => list[0]),
      )
      .subscribe(({ msg, raw, state }) => {
        console.debug('[midi] dbl', formatMidiDebug(msg, raw.input?.name));
        handleNoteOn(state, msg, { dbl: true });
      }),
  );

  subs.push(
    parsed$
      .pipe(
        filter(({ msg }) => msg.state === 'controller'),
        throttleTime(CC_THROTTLE_MS),
      )
      .subscribe(({ msg, raw, state }) => {
        console.debug('[midi]', formatMidiDebug(msg, raw.input?.name));
        handleController(state, msg, raw.input?.name);
      }),
  );

  onStop = () => {
    subs.forEach((sub) => sub.unsubscribe());
    state$Ref = null;
    didAutoConnect = false;
    onStop = () => {};
  };
};

/** Retry after denial / missing permission (re-starts access). */
export const retryAccess = () => {
  if (!state$Ref) return;
  start({ state$: state$Ref });
};

export const getScheme = (id = MIDI_SCHEME_MPK_MINI_IV) => SCHEMES[id] ?? mpkMiniIv;

export default {
  start,
  stop,
  retryAccess,
  findRowByMidiNote,
  getScheme,
};
