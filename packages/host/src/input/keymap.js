/**
 * Maps DOM KeyboardEvent.code values (what the on-screen keyboard and browsers
 * emit) to the key names of the injection backend (@nut-tree-fork/nut-js `Key`).
 */
const map = {
  Enter: 'Return', NumpadEnter: 'Enter', Escape: 'Escape', Tab: 'Tab', Space: 'Space',
  Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End',
  PageUp: 'PageUp', PageDown: 'PageDown', CapsLock: 'CapsLock', ScrollLock: 'ScrollLock',
  Pause: 'Pause', NumLock: 'NumLock', PrintScreen: 'Print', ContextMenu: 'Menu',
  ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
  ShiftLeft: 'LeftShift', ShiftRight: 'RightShift',
  ControlLeft: 'LeftControl', ControlRight: 'RightControl',
  AltLeft: 'LeftAlt', AltRight: 'RightAlt',
  MetaLeft: 'LeftSuper', MetaRight: 'RightSuper', OSLeft: 'LeftSuper', OSRight: 'RightSuper',
  Backquote: 'Grave', Minus: 'Minus', Equal: 'Equal', BracketLeft: 'LeftBracket',
  BracketRight: 'RightBracket', Backslash: 'Backslash', Semicolon: 'Semicolon', Quote: 'Quote',
  Comma: 'Comma', Period: 'Period', Slash: 'Slash',
  NumpadAdd: 'Add', NumpadSubtract: 'Subtract', NumpadMultiply: 'Multiply',
  NumpadDivide: 'Divide', NumpadDecimal: 'Decimal',
  AudioVolumeMute: 'AudioMute', AudioVolumeDown: 'AudioVolDown', AudioVolumeUp: 'AudioVolUp',
  MediaPlayPause: 'AudioPlay', MediaTrackNext: 'AudioNext', MediaTrackPrevious: 'AudioPrev', MediaStop: 'AudioStop',
};

export function domCodeToKeyName(code) {
  if (map[code]) return map[code];
  let m;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
  if ((m = /^Digit(\d)$/.exec(code))) return `Num${m[1]}`;
  if ((m = /^Numpad(\d)$/.exec(code))) return `NumPad${m[1]}`;
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
  return null;
}
