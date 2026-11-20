/**
 * What the user wants to do with a connected device. Chosen in the app (Home or Settings),
 * never forced: a purpose is one full-screen experience, not a mix.
 *   needsVideo   - the host's screen is streamed
 *   needsControl - the host must have granted remote control
 */
export const PURPOSES = [
  { id: 'mirror', icon: 'mirror', title: 'Mirror screen', hint: 'See this computer’s screen here', tint: 'mint', needsVideo: true, needsControl: false },
  { id: 'extend', icon: 'extend', title: 'Extend screen', hint: 'Use this device as a second monitor', tint: 'lime', needsVideo: true, needsControl: true },
  { id: 'trackpad', icon: 'trackpad', title: 'Trackpad', hint: 'Move the cursor, click and scroll', tint: 'peach', needsVideo: false, needsControl: true },
  { id: 'keyboard', icon: 'keyboard', title: 'Keyboard', hint: 'Type on the computer from here', tint: 'mint', needsVideo: false, needsControl: true },
  { id: 'pen', icon: 'pen', title: 'Pen pad', hint: 'Draw with a stylus or finger', tint: 'lime', needsVideo: false, needsControl: true },
];

export const purposeById = (id) => PURPOSES.find((p) => p.id === id) || PURPOSES[0];

/** Windows' own Win+P panel, same four choices in the same order. */
export const PROJECT_MODES = [
  { id: 'internal', title: 'PC screen only', hint: 'Only this computer’s screen is on', icon: 'monitor', local: false },
  { id: 'clone', title: 'Duplicate', hint: 'Show the same picture on both', icon: 'mirror', local: false },
  { id: 'extend', title: 'Extend', hint: 'Use the other screen as extra desktop', icon: 'extend', local: false },
  { id: 'external', title: 'Second screen only', hint: 'Turns this computer’s own screen off', icon: 'layout', local: true },
];
