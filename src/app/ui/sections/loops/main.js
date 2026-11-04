import { main, div, header, button, h2, i } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { slotPlayRecProgress } from '../../../util/loop-progress';
import { slotTempoPulseEnabled, slotTempoPulseTransform } from '../../../util/loop-pulse';
import { anyLoopSlotActive } from '../../../state/transport';
import {
  deselectLoopSlot,
  getLoopSlot,
  getLoopsTrack,
  loopsClearAll,
  loopsStopAll,
  loopsTogglePlay,
  openLoopLibraryPanel,
  selectLoopSlot,
  setLoopsInput,
  slotClear,
  slotHasContent,
  slotStop,
  slotTogglePlayRec,
  toggleLoopsClick,
  toggleLoopsProcessMic,
} from '../../../state/loops';
import dropdown, { caret } from '../../components/dropdown';

const SLOT_COUNT = 4;
let slotClickTimer = null;

const clearSlotClickTimer = () => {
  if (slotClickTimer) {
    clearTimeout(slotClickTimer);
    slotClickTimer = null;
  }
};

const onSlotClick = (index, ev) => {
  if (ev.detail > 1) return;
  clearSlotClickTimer();

  let deferDeselect = false;
  dispatch((s) => {
    if (s.ui?.loops?.selectedSlot !== index) {
      return selectLoopSlot(index)(s);
    }
    deferDeselect = true;
    return s;
  });

  if (deferDeselect) {
    slotClickTimer = setTimeout(() => {
      slotClickTimer = null;
      dispatch((s) => {
        if (s.ui?.loops?.selectedSlot === index) {
          return deselectLoopSlot(s);
        }
        return s;
      });
    }, 250);
  }
};

const onSlotDblClick = (index, ev) => {
  ev.preventDefault();
  clearSlotClickTimer();
  dispatch(openLoopLibraryPanel(index));
};

const slotStrip = (state, index) => {
  const slot = getLoopSlot(state, index);
  const process = slot?.process ?? 'empty';
  const selectedSlot = state.ui?.loops?.selectedSlot;
  const panels = state.ui?.loops?.panels ?? {};
  const isSelected = selectedSlot === index;
  const { pct: pgPercentage, countIn } = slotPlayRecProgress(state, slot);
  const tempoPulse = slotTempoPulseEnabled(state, slot);
  const pulseTransform = slotTempoPulseTransform(state, slot);
  const hasContent = slotHasContent(slot);
  const slotLabel = slot?.sample || `Slot ${index + 1}`;

  return div(`.loop-slot[data-slot="${index}"]`, [
    button(
      '.loop-slot-select',
      {
        class: {
          active: isSelected,
          assigned: hasContent,
          'panel-library': isSelected && panels.library,
          'panel-settings': isSelected && panels.settings,
        },
        props: {
          type: 'button',
          title: slot?.sample
            ? slot.sample
            : isSelected
              ? 'Click: deselect · Double-click: toggle library'
              : 'Click: select · Double-click: library',
        },
        on: {
          click: (ev) => onSlotClick(index, ev),
          dblclick: (ev) => onSlotDblClick(index, ev),
        },
      },
      slotLabel,
    ),
    button(
      '.play-rec',
      {
        class: {
          play: process === 'play',
          record: process === 'record',
          overdub: process === 'overdub',
          assigned: hasContent,
          'count-in': countIn,
          'tempo-pulse': tempoPulse,
        },
        style: {
          '--pgPercentage': String(pgPercentage),
          ...(pulseTransform ? { transform: pulseTransform } : {}),
        },
        props: {
          type: 'button',
          title: hasContent ? 'Play / Overdub' : 'Record',
          'aria-label': hasContent
            ? `Play or overdub slot ${index + 1}`
            : `Record slot ${index + 1}`,
          'aria-pressed': String(hasContent),
        },
        on: {
          click: (ev) => {
            ev.stopPropagation();
            dispatch(slotTogglePlayRec(index));
          },
        },
      },
      [],
    ),
    button(
      '.loop-slot-btn.stop',
      {
        props: {
          type: 'button',
          title: 'Stop slot · Double-click: clear',
          'aria-label': `Stop slot ${index + 1}`,
        },
        on: {
          click: (ev) => {
            ev.stopPropagation();
            dispatch(slotStop(index));
          },
          dblclick: (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            dispatch(slotClear(index));
          },
        },
      },
      [i('.fa.fa-stop')],
    ),
  ]);
};

const inputLabel = (devices, inputId) => {
  if (inputId === 'default') return 'Default input';
  const match = devices.find((d) => d.deviceId === inputId);
  return match?.label || 'Input';
};

export default (state) => {
  const loopsTrack = getLoopsTrack(state);
  const loopsPlaying = !!loopsTrack?.transport?.playing;
  const anySlotActive = anyLoopSlotActive(state);
  const inputId = loopsTrack?.loop?.inputId ?? 'default';
  const processMic = !!loopsTrack?.loop?.processMic;
  const devices = state.ui?.loops?.inputDevices ?? [];

  const inputItems = [
    {
      label: 'Default input',
      active: inputId === 'default',
      onSelect: () => dispatch(setLoopsInput('default')),
    },
    ...devices.map((d) => ({
      label: d.label || `Input ${d.deviceId.slice(0, 6)}`,
      active: d.deviceId === inputId,
      onSelect: () => dispatch(setLoopsInput(d.deviceId)),
    })),
  ];

  return main('.loops-main', [
    header('.loops-header', [
      h2('Loops'),
      button(
        '.track-transport-btn.play-toggle',
        {
          class: { active: loopsPlaying },
          props: {
            type: 'button',
            title: loopsPlaying ? 'Pause loops track' : 'Play all',
            'aria-label': loopsPlaying ? 'Pause loops track' : 'Play all loops',
            'aria-pressed': String(loopsPlaying),
          },
          on: { click: () => dispatch(loopsTogglePlay) },
        },
        [i(loopsPlaying ? '.fa.fa-pause' : '.fa.fa-play')],
      ),
      button(
        '.track-transport-btn.stop',
        {
          props: {
            type: 'button',
            title: 'Stop loops track',
            'aria-label': 'Stop all loops',
            disabled: !anySlotActive,
          },
          on: { click: () => dispatch(loopsStopAll) },
        },
        [i('.fa.fa-stop')],
      ),
      button(
        '.track-transport-btn.loops-clear-all',
        {
          props: { type: 'button', title: 'Clear all slots', 'aria-label': 'Clear all slots' },
          on: { click: () => dispatch(loopsClearAll) },
        },
        [i('.fa.fa-trash')],
      ),
      button(
        '.track-transport-btn.loops-click-toggle',
        {
          class: { active: !!loopsTrack?.loop?.clickEnabled },
          props: {
            type: 'button',
            title: loopsTrack?.loop?.clickEnabled
              ? 'Record count-in click on (1 bar)'
              : 'Record count-in click off',
            'aria-label': 'Toggle count-in click',
            'aria-pressed': String(!!loopsTrack?.loop?.clickEnabled),
          },
          on: { click: () => dispatch(toggleLoopsClick) },
        },
        [i('.fa.fa-hourglass-start')],
      ),
      dropdown('.loops-input', {
        handle: [inputLabel(devices, inputId), caret()],
        items: inputItems,
      }),
      button(
        '.track-transport-btn.loops-process-mic-toggle',
        {
          class: { active: processMic },
          props: {
            type: 'button',
            title: processMic
              ? 'Mic processing on (echo cancel / noise / AGC)'
              : 'Mic processing off (raw — better for music)',
            'aria-label': 'Toggle mic processing',
            'aria-pressed': String(processMic),
          },
          on: { click: () => dispatch(toggleLoopsProcessMic) },
        },
        [i('.fa.fa-filter')],
      ),
    ]),
    div(
      '.loop-slots',
      Array.from({ length: SLOT_COUNT }, (_, i) => slotStrip(state, i)),
    ),
  ]);
};
