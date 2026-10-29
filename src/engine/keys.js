// Canonical key names shared by both labs: isKeyDown/isKeyPressed/isKeyReleased/consumeKey
// accept these values (InputManager normalizes event.key: ' ' -> 'Space', letters -> lowercase).
// Java mirror: engine.Keys. Pad codes ACTION_* keep their keyboard aliases alongside.
export const Keys = Object.freeze({
  UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight',
  W: 'w', A: 'a', S: 's', D: 'd', X: 'x', Y: 'y', Z: 'z',
  DIGIT_1: '1', DIGIT_2: '2', DIGIT_3: '3',
  SPACE: 'Space', ENTER: 'Enter', SHIFT: 'Shift', TAB: 'Tab', ESCAPE: 'Escape',
  ACTION_A: 'ACTION_A', ACTION_B: 'ACTION_B', ACTION_X: 'ACTION_X', ACTION_Y: 'ACTION_Y',
  ACTION_START: 'ACTION_START', ACTION_SELECT: 'ACTION_SELECT',
});
