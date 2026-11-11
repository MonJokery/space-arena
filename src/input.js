// Замикання: стан клавіш приватний, назовні повертаємо лише методи.
export function createInput(target = window) {
  const pressed = new Set();
  const controlKeys = new Set(['ArrowUp', 'ArrowLeft', 'ArrowRight', 'Space']);

  function onKeyDown(event) {
    if (controlKeys.has(event.code)) event.preventDefault();
    pressed.add(event.code);
  }
  function onKeyUp(event) { pressed.delete(event.code); }
  function clear() { pressed.clear(); }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', clear);

  return {
    read() {
      return {
        thrust: pressed.has('KeyW') || pressed.has('ArrowUp'),
        left: pressed.has('KeyA') || pressed.has('ArrowLeft'),
        right: pressed.has('KeyD') || pressed.has('ArrowRight'),
        brake: pressed.has('Space'),
      };
    },
    destroy() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', clear);
    },
  };
}
