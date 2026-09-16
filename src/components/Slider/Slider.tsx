import React from 'react';

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  snapZero?: boolean;
  snapThreshold?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  className?: string;
  id?: string;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  min,
  max,
  step = 1,
  snapZero = false,
  snapThreshold = 0.5,
  unit = '',
  disabled = false,
  onChange,
  className = '',
  id,
}) => {
  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let nextVal = parseFloat(e.target.value);
    if (snapZero && Math.abs(nextVal) <= snapThreshold) {
      nextVal = 0;
    }
    onChange(nextVal);
  };

  return (
    <div
      className={`megu-slider-container ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        width: '100%',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          flex: 1,
          height: '24px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* Track background */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: '4px',
            borderRadius: 'var(--r-full)',
            background: 'var(--border-subtle)',
          }}
        />

        {/* Filled active track */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: `${percentage}%`,
            height: '4px',
            borderRadius: 'var(--r-full)',
            background: 'var(--accent)',
            transition: 'width var(--dur-fast) var(--ease-out)',
          }}
        />

        {/* Zero tick mark if min < 0 and max > 0 */}
        {min < 0 && max > 0 && (
          <div
            style={{
              position: 'absolute',
              left: `${((0 - min) / (max - min)) * 100}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '2px',
              height: '8px',
              background: 'var(--text-muted)',
              borderRadius: '1px',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Native range input for accessible dragging & keyboard navigation */}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={handleChange}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={`${value}${unit}`}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: disabled ? 'not-allowed' : 'pointer',
            margin: 0,
            zIndex: 2,
          }}
        />

        {/* Visual custom thumb */}
        <div
          style={{
            position: 'absolute',
            left: `${percentage}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '14px',
            height: '14px',
            borderRadius: 'var(--r-full)',
            background: 'var(--handle)',
            border: '2px solid var(--accent)',
            boxShadow: 'var(--shadow-1)',
            pointerEvents: 'none',
            zIndex: 1,
            transition: 'left var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)',
          }}
        />
      </div>

      <span
        className="timecode"
        style={{
          minWidth: '44px',
          textAlign: 'right',
          fontSize: 'var(--text-12)',
          color: 'var(--text-secondary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value > 0 && min < 0 ? `+${value}` : value}
        {unit}
      </span>
    </div>
  );
};
