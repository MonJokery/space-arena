export function createInput(target: Window = window) {
  const pressed = new Set<string>();
  const handlers = new Map<string, () => void>();
  const controls = { thrust: false, left: false, right: false, brake: false };
  const controlKeys = new Set(['ArrowUp', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyF', 'KeyH']);
  function onKeyDown(event: KeyboardEvent) {
    if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
    if (controlKeys.has(event.code)) event.preventDefault();
    if (!pressed.has(event.code)) handlers.get(event.code)?.();
    pressed.add(event.code);
  }
  function onKeyUp(event: KeyboardEvent) { pressed.delete(event.code); }
  function clear() { pressed.clear(); }
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', clear);
  return {
    on(code: string, callback: () => void) { handlers.set(code, callback); },
    read() {
      controls.thrust = pressed.has('KeyW') || pressed.has('ArrowUp');
      controls.left = pressed.has('KeyA') || pressed.has('ArrowLeft');
      controls.right = pressed.has('KeyD') || pressed.has('ArrowRight');
      controls.brake = pressed.has('Space');
      return controls;
    },
    isPressed(code: string) { return pressed.has(code); },
    destroy() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', clear);
    },
  };
}
