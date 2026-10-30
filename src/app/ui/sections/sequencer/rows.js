import { div, button } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { measureStepOn, toggleMeasureStep } from '../../../state/sequencer-measures';

const list = (length) => new Array(length).fill(0);

const shorten = (name, max = 14) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);

const stepCell = (state, bar, row, step, playhead) =>
  div('.step', {
    class: {
      active: measureStepOn(state, bar, row, step),
      playhead: playhead === step,
    },
    props: { title: `${row},${bar}:${step}` },
    on: {
      click: () => dispatch(toggleMeasureStep(bar, row, step)),
    },
  });

/** One bar of local steps for the viewed measure. */
export default (state, { rows, bar, stepsPerBar: perBar, playhead, onRowClick, onRowDblClick }) =>
  div(
    '.rows',
    list(rows).map((_, row) => {
      const sample = state.sequencer.assignments?.[row]?.sample;
      const rowLabel = sample ? shorten(sample) : `Row ${row}`;
      const panels = state.sequencer.panels ?? {};
      const isSelected = state.sequencer.selectedRow === row;

      return div(
        '.row',
        [].concat(
          button(
            {
              class: {
                active: isSelected,
                assigned: !!state.sequencer.assignments?.[row],
                'panel-library': isSelected && panels.library,
                'panel-settings': isSelected && panels.settings,
              },
              props: {
                title: isSelected
                  ? 'Click: deselect · Double-click: toggle library'
                  : 'Click: select (library or settings) · Double-click: library',
              },
              on: {
                click: (ev) => onRowClick(row, ev),
                dblclick: (ev) => onRowDblClick(row, ev),
              },
            },
            rowLabel,
          ),
          list(perBar).map((_, step) => stepCell(state, bar, row, step, playhead)),
        ),
      );
    }),
  );
