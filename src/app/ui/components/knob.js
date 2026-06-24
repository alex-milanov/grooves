import { div, span, input } from 'iblokz-snabbdom-helpers';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toKnobValue = (value, min, max) => (value - min) / (max - min);

const VERTICAL_SENSITIVITY = 0.005;
const TAP_MS = 300;
const MOVE_THRESHOLD = 4;

/** Survives Snabbdom re-renders while dragging. */
let activeDrag = null;
let lastTap = { time: 0, el: null };

const normalizeAngleDelta = (delta) => {
  if (delta > Math.PI) return delta - 2 * Math.PI;
  if (delta < -Math.PI) return delta + 2 * Math.PI;
  return delta;
};

const formatValue = (v) => {
  const rounded = Math.round(v * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
};

const setDragging = (fieldEl, dragging, displayValue) => {
  if (!fieldEl) return;
  fieldEl.classList.toggle('dragging', dragging);
  const bubble = fieldEl.querySelector('.knob-value');
  if (bubble) bubble.textContent = displayValue ?? '';
};

const knobCenter = (el) => {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

export default ({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  defaultValue,
  disabled = false,
  onChange,
}) => {
  const knobValue = toKnobValue(value, min, max);
  const resetValue = defaultValue ?? (min + max) / 2;

  const emit = (next) => {
    const clamped = clamp(next, min, max);
    if (clamped !== value) onChange(clamped);
    return clamped;
  };

  const onPointerDown = (ev) => {
    if (disabled) return;
    ev.preventDefault();

    const hitEl = ev.currentTarget;
    const knobEl = hitEl.querySelector('.knob') ?? hitEl;
    const fieldEl = hitEl.closest('.knob-field');
    const { x: centerX, y: centerY } = knobCenter(knobEl);
    const mode = ev.pointerType === 'touch' ? 'radial' : 'vertical';
    const startAngle = Math.atan2(ev.clientY - centerY, ev.clientX - centerX);

    activeDrag = {
      pointerId: ev.pointerId,
      fieldEl,
      mode,
      startValue: value,
      accumulated: value,
      startY: ev.clientY,
      centerX,
      centerY,
      lastAngle: startAngle,
      moved: false,
    };

    setDragging(fieldEl, true, formatValue(value));
    hitEl.setPointerCapture(ev.pointerId);
  };

  const onPointerMove = (ev) => {
    if (!activeDrag || disabled || activeDrag.pointerId !== ev.pointerId) return;

    if (activeDrag.mode === 'radial') {
      const angle = Math.atan2(ev.clientY - activeDrag.centerY, ev.clientX - activeDrag.centerX);
      const delta = normalizeAngleDelta(angle - activeDrag.lastAngle);
      activeDrag.lastAngle = angle;
      if (Math.abs(delta) > 0.001) activeDrag.moved = true;
      activeDrag.accumulated += (delta / (2 * Math.PI)) * (max - min);
      const next = emit(activeDrag.accumulated);
      setDragging(activeDrag.fieldEl, true, formatValue(next));
      return;
    }

    const dy = activeDrag.startY - ev.clientY;
    if (Math.abs(dy) > MOVE_THRESHOLD) activeDrag.moved = true;
    const next = emit(activeDrag.startValue + dy * VERTICAL_SENSITIVITY * (max - min));
    setDragging(activeDrag.fieldEl, true, formatValue(next));
  };

  const onPointerUp = (ev) => {
    if (!activeDrag || activeDrag.pointerId !== ev.pointerId) return;

    const hitEl = ev.currentTarget;
    const now = Date.now();

    if (!activeDrag.moved && now - lastTap.time < TAP_MS && lastTap.el === hitEl) {
      emit(resetValue);
      lastTap = { time: 0, el: null };
    } else if (!activeDrag.moved) {
      lastTap = { time: now, el: hitEl };
    } else {
      lastTap = { time: 0, el: null };
    }

    setDragging(activeDrag.fieldEl, false);
    activeDrag = null;

    try {
      hitEl.releasePointerCapture(ev.pointerId);
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

  const pointerHandlers = {
    pointerdown: onPointerDown,
    pointermove: onPointerMove,
    pointerup: onPointerUp,
    pointercancel: onPointerUp,
  };

  return div(
    '.knob-field',
    {
      class: { disabled },
    },
    [
      span('.knob-value'),
      div(
        '.knob-hit',
        {
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
            ...pointerHandlers,
            wheel: onWheel,
          },
        },
        [
          div('.knob', {
            style: { '--knob-value': String(knobValue) },
          }),
        ],
      ),
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
