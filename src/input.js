export function createInput(target = window) {
  const pressed = new Set();
  const handlers = new Map();
  const controlKeys = new Set(['ArrowUp', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyF', 'KeyH']);
  function onKeyDown(event) {
    if (controlKeys.has(event.code)) event.preventDefault();
    if (!pressed.has(event.code)) handlers.get(event.code)?.();
    pressed.add(event.code);
  }
  function onKeyUp(event) { pressed.delete(event.code); }
  function clear() { pressed.clear(); }
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', clear);
  return {
    on(code, callback) { handlers.set(code, callback); },
    read() {
      return {
        thrust: pressed.has('KeyW') || pressed.has('ArrowUp'),
        left: pressed.has('KeyA') || pressed.has('ArrowLeft'),
        right: pressed.has('KeyD') || pressed.has('ArrowRight'),
        brake: pressed.has('Space'),
      };
    },
    isPressed(code) { return pressed.has(code); },
    destroy() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', clear);
    },
  };
}
