import type { Lobby, RoomInfo } from './lobby.ts';
export function connectLobbyView(lobby: Lobby, root: HTMLElement): void {
  const nameInput = root.querySelector<HTMLInputElement>('#player-name')!;
  const roomsSelect = root.querySelector<HTMLSelectElement>('#room-list')!;
  const status = root.querySelector<HTMLElement>('#lobby-status')!;
  const join = root.querySelector<HTMLButtonElement>('#join')!;
  let rooms: RoomInfo[] = [];
  lobby.addEventListener('rooms', (event) => {
    if (!(event instanceof CustomEvent)) return;
    const next: unknown = event.detail;
    if (!Array.isArray(next)) return;
    rooms = next.filter((item): item is RoomInfo => typeof item === 'object' && item !== null && typeof item.id === 'string');
    const chosen = roomsSelect.value;
    roomsSelect.replaceChildren(...rooms.map((room) => {
      const option = document.createElement('option'); option.value = room.id;
      option.textContent = `${room.name} (${room.asteroids} астероїдів)`; return option;
    }));
    if (rooms.some((room) => room.id === chosen)) roomsSelect.value = chosen;
    join.disabled = rooms.length === 0;
    status.textContent = `Доступно кімнат: ${rooms.length}. Список оновлюється кожні 5 с.`;
  });
  lobby.addEventListener('error', (event) => { status.textContent = `Не вдалося оновити кімнати: ${event instanceof CustomEvent ? String(event.detail) : 'Помилка'}`; });
  root.querySelector<HTMLFormElement>('#create-room-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = (selector: string) => root.querySelector<HTMLInputElement>(selector)!.value;
    const payload = { id: value('#new-room-id').trim(), name: value('#new-room-name').trim(),
      width: Number(value('#new-room-width')), height: Number(value('#new-room-height')),
      asteroids: Number(value('#new-room-asteroids')) };
    try {
      const response = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      status.textContent = 'Кімнату створено.';
      await lobby.refresh(); roomsSelect.value = payload.id;
    } catch (error: unknown) { status.textContent = `Не вдалося створити кімнату: ${error instanceof Error ? error.message : String(error)}`; }
  });
  root.querySelector('#refresh-rooms')?.addEventListener('click', () => { void lobby.refresh(); });
  root.querySelector('#join-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const room = rooms.find((item) => item.id === roomsSelect.value);
    if (!lobby.join(nameInput.value, room)) status.textContent = 'Введіть ім’я й оберіть кімнату.';
  });
}
