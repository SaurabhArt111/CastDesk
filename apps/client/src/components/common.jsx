import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { useApp } from '../state/AppContext.jsx';

export function Logo({ size = 28 }) {
  return (
    <span className="logo">
      <img src="./icon.svg" width={size} height={size} alt="" />
      <span>CastDesk</span>
    </span>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && (
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={`row switch-row ${disabled ? 'is-disabled' : ''}`}>
      <span className="row-text">
        <span className="row-title">{label}</span>
        {hint && <span className="row-hint">{hint}</span>}
      </span>
      <input type="checkbox" className="switch" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Segmented({ value, options, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={16} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ label, hint, value, min, max, step = 1, onChange, format = (v) => v }) {
  return (
    <label className="row slider-row">
      <span className="row-text">
        <span className="row-title">{label}</span>
        {hint && <span className="row-hint">{hint}</span>}
      </span>
      <span className="slider-wrap">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <output>{format(value)}</output>
      </span>
    </label>
  );
}

/** Six boxes that behave like one input (paste, backspace, auto-advance). */
export function PinInput({ value, onChange, onComplete, autoFocus = true, length = 6, invalid }) {
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const set = (raw) => {
    const v = raw.replace(/\D/g, '').slice(0, length);
    onChange(v);
    if (v.length === length) onComplete?.(v);
  };
  return (
    <div className={`pin-input ${invalid ? 'invalid' : ''}`} onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        className="pin-hidden"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        value={value}
        aria-label="PIN"
        onChange={(e) => set(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {Array.from({ length }).map((_, i) => (
        <span key={i} className={`pin-box ${value[i] ? 'filled' : ''} ${focused && i === value.length ? 'active' : ''}`}>
          {value[i] || ''}
        </span>
      ))}
    </div>
  );
}

export function Badge({ children, tone = 'neutral', icon }) {
  return (
    <span className={`badge badge-${tone}`}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export function EmptyState({ icon = 'info', title, children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
