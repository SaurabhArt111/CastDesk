import Icon from './Icon.jsx';
import { PURPOSES } from '../lib/purposes.js';

/** Five big tiles: what should the connected device be used for? */
export default function PurposePicker({ value, onChange, compact = false }) {
  return (
    <div className={`purposes ${compact ? 'compact' : ''}`} role="radiogroup" aria-label="Use this device as">
      {PURPOSES.map((p) => (
        <button key={p.id} role="radio" aria-checked={value === p.id} className={`purpose tint-${p.tint} ${value === p.id ? 'on' : ''}`} onClick={() => onChange(p.id)}>
          <span className="purpose-ico"><Icon name={p.icon} size={22} /></span>
          <strong>{p.title}</strong>
          {!compact && <small>{p.hint}</small>}
          {value === p.id && <span className="purpose-check"><Icon name="check" size={14} /></span>}
        </button>
      ))}
    </div>
  );
}
