import { div, span, input } from 'iblokz-snabbdom-helpers';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toKnobValue = (value, min, max) => (value - min) / (max - min);

export default ({ label, value, min = 0, max = 1, step = 0.01, disabled = false, onChange }) => {
  const knobValue = toKnobValue(value, min, max);
  let drag = null;

  const emit = (next) => {
    const clamped = clamp(next, min, max);
    if (clamped !== value) onChange(clamped);
  };

  const onPointerDown = (ev) => {
    if (disabled) return;
    ev.preventDefault();
    drag = { y: ev.clientY, value };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };

  const onPointerMove = (ev) => {
    if (!drag || disabled) return;
    const delta = (drag.y - ev.clientY) * 0.005 * (max - min);
    emit(clamp(drag.value + delta, min, max));
  };

  const onPointerUp = (ev) => {
    if (!drag) return;
    drag = null;
    try {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    } catch (_) {
      /* released */
    }
  };

  const onWheel = (ev) => {
    if (disabled) return;
    ev.preventDefault();
    const delta = ev.deltaY > 0 ? -step : step;
    emit(value + delta);
  };

  return div(
    '.knob-field',
    {
      class: { disabled },
    },
    [
      div('.knob', {
        style: { '--knob-value': String(knobValue) },
        props: {
          role: 'slider',
          'aria-label': label,
          'aria-valuemin': String(min),
          'aria-valuemax': String(max),
          'aria-valuenow': String(value),
          'aria-disabled': disabled ? 'true' : 'false',
          tabIndex: disabled ? -1 : 0,
        },
        on: {
          pointerdown: onPointerDown,
          pointermove: onPointerMove,
          pointerup: onPointerUp,
          pointercancel: onPointerUp,
          wheel: onWheel,
        },
      }),
      span('.knob-label', label),
      input({
        props: {
          type: 'range',
          min,
          max,
          step,
          value,
          disabled,
          tabIndex: -1,
          'aria-hidden': 'true',
        },
        class: { 'knob-input': true },
        on: {
          input: (ev) => emit(Number(ev.target.value)),
        },
      }),
    ],
  );
};
