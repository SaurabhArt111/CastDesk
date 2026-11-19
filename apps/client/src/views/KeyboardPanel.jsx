import { useRef, useState } from 'react';
import { vibrate } from '../lib/format.js';

const FN = ['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'PrintScreen', 'Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown'];
const ROWS = [
  ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace'],
  ['Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'],
  ['CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Enter'],
  ['ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'ArrowUp', 'ShiftRight'],
  ['ControlLeft', 'MetaLeft', 'AltLeft', 'Space', 'AltRight', 'ArrowLeft', 'ArrowDown', 'ArrowRight'],
];
const LABEL = {
  Backquote: '`', Minus: '-', Equal: '=', Backspace: '⌫', Tab: 'Tab', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  CapsLock: 'Caps', Semicolon: ';', Quote: "'", Enter: 'Enter', ShiftLeft: 'Shift', ShiftRight: 'Shift', Comma: ',', Period: '.', Slash: '/',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ControlLeft: 'Ctrl', MetaLeft: 'Win', AltLeft: 'Alt', AltRight: 'Alt', Space: '',
  Escape: 'Esc', PrintScreen: 'PrtSc', Insert: 'Ins', Delete: 'Del', PageUp: 'PgUp', PageDown: 'PgDn',
};
const label = (c) => LABEL[c] ?? c.replace(/^Key|^Digit/, '');
const MODS = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'AltLeft', 'AltRight', 'MetaLeft']);
const WIDE = { Backspace: 2, Tab: 1.5, CapsLock: 1.8, Enter: 2.2, ShiftLeft: 2.3, ShiftRight: 2.3, Space: 6, ControlLeft: 1.4, MetaLeft: 1.4, AltLeft: 1.4, AltRight: 1.4, Backslash: 1.5 };

/**
 * Full on-screen keyboard. Modifier keys are sticky (tap Ctrl, then C = Ctrl+C);
 * double-tap a modifier to lock it. The text box feeds the phone's own keyboard
 * (including voice typing and emoji) to the host as typed text.
 */
export default function KeyboardPanel({ conn, haptics }) {
  const [held, setHeld] = useState({}); // code -> 'once' | 'lock'
  const lastTap = useRef({});
  const [text, setText] = useState('');
  const composing = useRef(false);

  const key = (code, down) => conn.input({ k: 'key', code, down });
  const tap = (code) => {
    vibrate(haptics);
    if (MODS.has(code)) {
      const now = performance.now();
      const doubled = now - (lastTap.current[code] || 0) < 350;
      lastTap.current[code] = now;
      setHeld((h) => {
        const next = { ...h };
        if (h[code]) {
          if (h[code] === 'once' && doubled) next[code] = 'lock';
          else {
            delete next[code];
            key(code, false);
          }
        } else {
          next[code] = 'once';
          key(code, true);
        }
        return next;
      });
      return;
    }
    key(code, true);
    key(code, false);
    setHeld((h) => {
      const next = {};
      for (const [c, mode] of Object.entries(h)) {
        if (mode === 'lock') next[c] = mode;
        else key(c, false);
      }
      return next;
    });
  };

  const flushText = (value) => {
    if (value) conn.input({ k: 'text', text: value });
    setText('');
  };

  return (
    <div className="kbd" onPointerDown={(e) => e.preventDefault()}>
      <input
        className="kbd-text"
        value={text}
        placeholder="Tap here to type with your keyboard, voice or emoji…"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          if (!composing.current) flushText(e.target.value);
        }}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={(e) => {
          composing.current = false;
          flushText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') tap('Enter');
          else if (e.key === 'Backspace' && !text) tap('Backspace');
        }}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <div className="kbd-fn">
        {FN.map((c) => (
          <button key={c} className="kbd-key" onClick={() => tap(c)}>
            {label(c)}
          </button>
        ))}
      </div>
      {ROWS.map((row, i) => (
        <div className="kbd-row" key={i}>
          {row.map((c) => (
            <button
              key={c}
              className={`kbd-key ${held[c] ? `held ${held[c]}` : ''}`}
              style={{ flexGrow: WIDE[c] || 1 }}
              onClick={() => tap(c)}
              aria-pressed={Boolean(held[c])}
            >
              {label(c)}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
