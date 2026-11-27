import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  snapZero?: boolean;
  snapThreshold?: number;
  unit?: string;
  bipolar?: boolean;
  disabled?: boolean;
  hideValue?: boolean;
  ariaLabel?: string;
  onChange: (value: number) => void;
  onDoubleClick?: () => void;
  className?: string;
  id?: string;
}

const THUMB_RADIUS = 7;

function getDecimalPlaces(step: number): number {
  const s = step.toString();
  if (s.includes('e-')) {
    const exp = parseInt(s.split('e-')[1] ?? '0', 10);
    return Number.isFinite(exp) ? exp : 0;
  }
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

function roundToStep(raw: number, min: number, max: number, step: number): number {
  const clamped = Math.max(min, Math.min(max, raw));
  if (step <= 0) return clamped;
  const snapped = Math.round((clamped - min) / step) * step + min;
  const bounded = Math.max(min, Math.min(max, snapped));
  const decimals = getDecimalPlaces(step);
  return Number(bounded.toFixed(decimals));
}

export const Slider: React.FC<SliderProps> = ({
  value,
  min,
  max,
  step = 1,
  snapZero = false,
  snapThreshold = 0.5,
  unit = '',
  bipolar = false,
  disabled = false,
  hideValue = false,
  ariaLabel,
  onChange,
  onDoubleClick,
  className = '',
  id,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const grabOffsetPxRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const rafIdRef = useRef<number | null>(null);
  const pendingValueRef = useRef<number | null>(null);
  const lastEmittedRef = useRef<number>(value);

  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [dragPct, setDragPct] = useState<number | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    lastEmittedRef.current = value;
  }, [value]);

  const range = max - min;
  const clampPct = (p: number) => Math.max(0, Math.min(100, p));

  const valueToPct = (val: number): number => {
    if (range <= 0) return 0;
    return clampPct(((val - min) / range) * 100);
  };

  const propPct = valueToPct(value);
  const activePct = dragPct !== null ? dragPct : propPct;

  const flushPendingChange = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (pendingValueRef.current !== null) {
      const next = pendingValueRef.current;
      pendingValueRef.current = null;
      if (next !== lastEmittedRef.current) {
        lastEmittedRef.current = next;
        onChangeRef.current(next);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (pendingValueRef.current !== null) {
        const next = pendingValueRef.current;
        pendingValueRef.current = null;
        if (next !== lastEmittedRef.current) {
          lastEmittedRef.current = next;
          onChangeRef.current(next);
        }
      }
    };
  }, []);

  const scheduleChange = useCallback((nextVal: number) => {
    pendingValueRef.current = nextVal;
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        if (pendingValueRef.current !== null) {
          const val = pendingValueRef.current;
          pendingValueRef.current = null;
          if (val !== lastEmittedRef.current) {
            lastEmittedRef.current = val;
            onChangeRef.current(val);
          }
        }
      });
    }
  }, []);

  const computeFromClientX = useCallback(
    (clientX: number, grabOffsetPx: number): { pct: number; quantized: number } | null => {
      const el = trackRef.current;
      if (!el || range <= 0) return null;
      const rect = el.getBoundingClientRect();
      const usableWidth = Math.max(1, rect.width - THUMB_RADIUS * 2);
      const centerPx = clientX - grabOffsetPx - rect.left - THUMB_RADIUS;
      const rawRatio = Math.max(0, Math.min(1, centerPx / usableWidth));
      let rawValue = min + rawRatio * range;

      if (snapZero && min < 0 && max > 0 && Math.abs(rawValue) <= snapThreshold) {
        rawValue = 0;
        const zeroPct = valueToPct(0);
        return { pct: zeroPct, quantized: 0 };
      }

      const quantized = roundToStep(rawValue, min, max, step);
      return {
        pct: rawRatio * 100,
        quantized,
      };
    },
    [max, min, range, snapThreshold, snapZero, step],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    const el = trackRef.current;
    if (!el) return;
    e.preventDefault();
    el.focus();

    const rect = el.getBoundingClientRect();
    const usableWidth = Math.max(1, rect.width - THUMB_RADIUS * 2);
    const thumbCenterX = rect.left + THUMB_RADIUS + (propPct / 100) * usableWidth;
    const distFromThumb = e.clientX - thumbCenterX;

    // Preserve exact cursor-to-thumb offset when grabbing the thumb directly;
    // when clicking elsewhere on the track, center the thumb on the pointer immediately.
    const grabOffset = Math.abs(distFromThumb) <= THUMB_RADIUS + 4 ? distFromThumb : 0;
    grabOffsetPxRef.current = grabOffset;
    isDraggingRef.current = true;
    setIsDragging(true);

    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events in tests may not have an active pointerId
    }

    const res = computeFromClientX(e.clientX, grabOffset);
    if (res) {
      setDragPct(res.pct);
      scheduleChange(res.quantized);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || disabled) return;
    const res = computeFromClientX(e.clientX, grabOffsetPxRef.current);
    if (res) {
      setDragPct(res.pct);
      scheduleChange(res.quantized);
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    setDragPct(null);
    flushPendingChange();
    const el = trackRef.current;
    if (el) {
      try {
        if (el.hasPointerCapture(e.pointerId)) {
          el.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore capture release errors
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || range <= 0) return;
    const coarse = Math.max(step, range / 20);
    const deltaStep = e.shiftKey ? coarse : step;
    let next: number | null = null;

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = roundToStep(value + deltaStep, min, max, step);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = roundToStep(value - deltaStep, min, max, step);
        break;
      case 'Home':
        next = min;
        break;
      case 'End':
        next = max;
        break;
      case 'PageUp':
        next = roundToStep(value + coarse, min, max, step);
        break;
      case 'PageDown':
        next = roundToStep(value - coarse, min, max, step);
        break;
      default:
        return;
    }

    if (next !== null) {
      e.preventDefault();
      e.stopPropagation();
      if (snapZero && min < 0 && max > 0 && Math.abs(next) < snapThreshold * 0.5) {
        next = 0;
      }
      if (next !== value) {
        lastEmittedRef.current = next;
        onChange(next);
      }
    }
  };

  const zeroPct = bipolar && min < 0 && max > 0 ? valueToPct(0) : 0;

  let fillLeft = '0%';
  let fillWidth = `${activePct}%`;
  if (bipolar && min < 0 && max > 0) {
    if (activePct >= zeroPct) {
      fillLeft = `${zeroPct}%`;
      fillWidth = `${activePct - zeroPct}%`;
    } else {
      fillLeft = `${activePct}%`;
      fillWidth = `${zeroPct - activePct}%`;
    }
  }

  const formatVal = (v: number) => {
    const decimals = getDecimalPlaces(step);
    const fixed = Number(v.toFixed(decimals));
    const sign = bipolar && fixed > 0 ? '+' : '';
    return `${sign}${fixed}${unit ? ` ${unit}` : ''}`;
  };

  const thumbLeftStyle = `calc(${THUMB_RADIUS}px + (100% - ${THUMB_RADIUS * 2}px) * ${(activePct / 100).toFixed(5)})`;

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        width: '100%',
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <div
        ref={trackRef}
        id={id}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onDoubleClick={onDoubleClick}
        style={{
          position: 'relative',
          flex: 1,
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          cursor: isDragging ? 'grabbing' : 'pointer',
          touchAction: 'none',
          userSelect: 'none',
          outline: 'none',
        }}
      >
        {/* Background track */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '4px',
            borderRadius: 'var(--r-pill)',
            background: 'var(--bg-hover)',
            overflow: 'hidden',
          }}
        >
          {/* Active fill — NO CSS width/left transitions so dragging is locked 1:1 to cursor */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: fillLeft,
              width: fillWidth,
              background: isDragging || isHovered ? 'var(--accent)' : 'var(--accent)',
              borderRadius: 'var(--r-pill)',
            }}
          />
        </div>

        {/* Center tick for bipolar */}
        {bipolar && min < 0 && max > 0 && (
          <div
            style={{
              position: 'absolute',
              left: `calc(${THUMB_RADIUS}px + (100% - ${THUMB_RADIUS * 2}px) * ${(zeroPct / 100).toFixed(5)})`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '2px',
              height: '8px',
              background: 'var(--border-strong)',
              borderRadius: '1px',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Thumb — NO left transition; only scale/box-shadow animate smoothly */}
        <div
          style={{
            position: 'absolute',
            left: thumbLeftStyle,
            top: '50%',
            transform: `translate(-50%, -50%) scale(${isDragging ? 1.15 : isHovered || isFocused ? 1.08 : 1})`,
            width: `${THUMB_RADIUS * 2}px`,
            height: `${THUMB_RADIUS * 2}px`,
            borderRadius: '50%',
            background: 'var(--text-primary)',
            border: `2px solid ${isDragging || isHovered || isFocused ? 'var(--accent)' : 'var(--bg-surface)'}`,
            boxShadow: isDragging
              ? '0 0 0 3px var(--accent-muted), 0 1px 4px rgba(0,0,0,0.4)'
              : isFocused
                ? '0 0 0 2px var(--accent-muted), 0 1px 3px rgba(0,0,0,0.35)'
                : '0 1px 3px rgba(0,0,0,0.35)',
            pointerEvents: 'none',
            transition: 'transform 90ms ease-out, box-shadow 90ms ease-out, border-color 90ms ease-out',
            willChange: isDragging ? 'left, transform' : 'auto',
          }}
        />
      </div>

      {!hideValue && (
        <span
          className="font-mono"
          style={{
            minWidth: '48px',
            textAlign: 'right',
            fontSize: 'var(--text-11)',
            color: 'var(--text-secondary)',
            fontVariantNumeric: 'tabular-nums',
            userSelect: 'none',
          }}
        >
          {formatVal(value)}
        </span>
      )}
    </div>
  );
};
