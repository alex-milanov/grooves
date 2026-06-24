import { div, header, button, h2, label, i } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { context } from '../../util/audio';
import { getLoopSlot, getLoopsTrack, slotHasContent } from '../../util/loops-state';
import {
  deselectLoopSlot,
  loopsClearAll,
  loopsStopAll,
  loopsTogglePlay,
  openLoopLibraryPanel,
  setLoopsInput,
  slotClear,
  slotStop,
  slotTogglePlayRec,
  toggleLoopsClick,
} from '../../util/loop-actions';
import { selectLoopSlot as selectSlotState } from '../../util/loops-panels';
import dropdown, { caret } from '../components/dropdown';

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
      return selectSlotState(s, index);
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
  dispatch((s) => openLoopLibraryPanel(s, index));
};

const calcProgress = (startedAt, duration) => {
  if (!startedAt || !duration) return 0;
  return (((context.currentTime - startedAt) % duration) / duration) * 100;
};

const slotStrip = (state, index) => {
  const slot = getLoopSlot(state, index);
  const process = slot?.process ?? 'empty';
  const selectedSlot = state.ui?.loops?.selectedSlot;
  const panels = state.ui?.loops?.panels ?? {};
  const isSelected = selectedSlot === index;
  const pgPercentage = process === 'play' ? calcProgress(slot?.startedAt, slot?.duration) : 0;

  return div(`.loop-slot[data-slot="${index}"]`, [
    button(
      '.loop-slot-select',
      {
        class: {
          active: isSelected,
          assigned: slotHasContent(slot),
          'panel-library': isSelected && panels.library,
          'panel-settings': isSelected && panels.settings,
        },
        props: {
          type: 'button',
          title: isSelected
            ? 'Click: deselect · Double-click: toggle library'
            : 'Click: select · Double-click: library',
        },
        on: {
          click: (ev) => onSlotClick(index, ev),
          dblclick: (ev) => onSlotDblClick(index, ev),
        },
      },
      `Slot ${index + 1}`,
    ),
    button(
      '.play-rec',
      {
        class: {
          play: process === 'play',
          record: process === 'record',
          overdub: process === 'overdub',
        },
        style: {
          '--pgPercentage': String(pgPercentage),
        },
        props: {
          type: 'button',
          title: 'Play / Record',
          'aria-label': `Play or record slot ${index + 1}`,
        },
        on: {
          click: (ev) => {
            ev.stopPropagation();
            slotTogglePlayRec(index);
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
            slotStop(index);
          },
          dblclick: (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            slotClear(index);
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
  const inputId = loopsTrack?.loop?.inputId ?? 'default';
  const devices = state.ui?.loops?.inputDevices ?? [];

  const inputItems = [
    {
      label: 'Default input',
      active: inputId === 'default',
      onSelect: () => setLoopsInput('default'),
    },
    ...devices.map((d) => ({
      label: d.label || `Input ${d.deviceId.slice(0, 6)}`,
      active: d.deviceId === inputId,
      onSelect: () => setLoopsInput(d.deviceId),
    })),
  ];

  return div('.loops-main.sequencer', [
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
          on: { click: () => loopsTogglePlay() },
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
            disabled: !loopsPlaying,
          },
          on: { click: () => loopsStopAll() },
        },
        [i('.fa.fa-stop')],
      ),
      button(
        '.track-transport-btn.loops-clear-all',
        {
          props: { type: 'button', title: 'Clear all slots', 'aria-label': 'Clear all slots' },
          on: { click: () => loopsClearAll() },
        },
        [i('.fa.fa-trash')],
      ),
      label('Input'),
      dropdown('.loops-input.control', {
        handle: [inputLabel(devices, inputId), caret()],
        items: inputItems,
      }),
      button(
        '.track-transport-btn.loops-click-toggle',
        {
          class: { active: !!loopsTrack?.loop?.clickEnabled },
          props: {
            type: 'button',
            title: loopsTrack?.loop?.clickEnabled
              ? 'Count-in click on (1 bar)'
              : 'Count-in click off',
            'aria-label': 'Toggle count-in click',
            'aria-pressed': String(!!loopsTrack?.loop?.clickEnabled),
          },
          on: { click: () => toggleLoopsClick() },
        },
        [i('.fa.fa-bullseye')],
      ),
    ]),
    div(
      '.loop-slots',
      Array.from({ length: SLOT_COUNT }, (_, i) => slotStrip(state, i)),
    ),
  ]);
};
