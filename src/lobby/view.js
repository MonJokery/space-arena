export function connectLobbyView(lobby, root) {
  const nameInput = root.querySelector('#player-name');
  const roomsSelect = root.querySelector('#room-list');
  const status = root.querySelector('#lobby-status');
  const join = root.querySelector('#join');
  let rooms = [];
  lobby.addEventListener('rooms', (event) => {
    rooms = event.detail;
    const chosen = roomsSelect.value;
    roomsSelect.replaceChildren(...rooms.map((room) => {
      const option = document.createElement('option'); option.value = room.id;
      option.textContent = `${room.name} (${room.asteroids} астероїдів)`; return option;
    }));
    if (rooms.some((room) => room.id === chosen)) roomsSelect.value = chosen;
    join.disabled = rooms.length === 0;
    status.textContent = `Доступно кімнат: ${rooms.length}. Список оновлюється кожні 5 с.`;
  });
  lobby.addEventListener('error', (event) => { status.textContent = `Не вдалося оновити кімнати: ${event.detail}`; });
  root.querySelector('#refresh-rooms').addEventListener('click', () => { void lobby.refresh(); });
  root.querySelector('#join-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const room = rooms.find((item) => item.id === roomsSelect.value);
    if (!lobby.join(nameInput.value, room)) status.textContent = 'Введіть ім’я й оберіть кімнату.';
  });
}
