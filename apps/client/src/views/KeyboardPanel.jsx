import { useEffect, useRef, useState } from 'react';
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

const TOGGLE = new Set(['CapsLock']); // a real Caps Lock is a tap, everything else is "down while held"

/**
 * Full on-screen keyboard that behaves like a physical one: a key is down while your finger is on
 * it and up when you lift. Hold Ctrl with one finger and tap C with another for Ctrl+C; hold a letter
 * and the computer repeats it. Multi-touch is supported because every key tracks its own pointer.
 * The text box feeds the phone's own keyboard (voice typing, emoji, other languages) as typed text.
 */
export default function KeyboardPanel({ conn, haptics }) {
  const [down, setDown] = useState(() => new Set());
  const active = useRef(new Map()); // pointerId -> code
  const [text, setText] = useState('');
  const composing = useRef(false);

  const key = (code, isDown) => conn.input({ k: 'key', code, down: isDown });
  const mark = (code, on) =>
    setDown((d) => {
      const n = new Set(d);
      if (on) n.add(code);
      else n.delete(code);
      return n;
    });

  const press = (e, code) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    vibrate(haptics);
    if (TOGGLE.has(code)) {
      key(code, true);
      key(code, false);
      return;
    }
    active.current.set(e.pointerId, code);
    mark(code, true);
    key(code, true);
  };
  const release = (e) => {
    const code = active.current.get(e.pointerId);
    if (!code) return;
    active.current.delete(e.pointerId);
    mark(code, false);
    key(code, false);
  };

  // never leave a key stuck down on the computer
  useEffect(() => {
    const map = active.current;
    const letGo = () => {
      for (const code of map.values()) key(code, false);
      map.clear();
      setDown(new Set());
    };
    document.addEventListener('visibilitychange', letGo);
    window.addEventListener('blur', letGo);
    return () => {
      document.removeEventListener('visibilitychange', letGo);
      window.removeEventListener('blur', letGo);
      letGo();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flushText = (value) => {
    if (value) conn.input({ k: 'text', text: value });
    setText('');
  };
  const tapOnce = (code) => {
    key(code, true);
    key(code, false);
  };
  const keyProps = (c) => ({
    onPointerDown: (e) => press(e, c),
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: release,
    onContextMenu: (e) => e.preventDefault(),
  });

  return (
    <div className="kbd">
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
          if (e.key === 'Enter') tapOnce('Enter');
          else if (e.key === 'Backspace' && !text) tapOnce('Backspace');
        }}
      />
      <div className="kbd-fn">
        {FN.map((c) => (
          <button key={c} className={`kbd-key ${down.has(c) ? 'held' : ''}`} {...keyProps(c)}>
            {label(c)}
          </button>
        ))}
      </div>
      {ROWS.map((row, i) => (
        <div className="kbd-row" key={i}>
          {row.map((c) => (
            <button key={c} className={`kbd-key ${down.has(c) ? 'held' : ''} ${MODS.has(c) ? 'mod' : ''}`} style={{ flexGrow: WIDE[c] || 1 }} {...keyProps(c)}>
              {label(c)}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
