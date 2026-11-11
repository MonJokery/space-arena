// Шина подій відділяє симуляцію від звуку та інтерфейсу.
export const gameEvents = new EventTarget();
export function emitGameEvent(type, detail = {}) {
  gameEvents.dispatchEvent(new CustomEvent(type, { detail }));
}
