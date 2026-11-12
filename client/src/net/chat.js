import { GameSocket } from './socket.js';

export function createChat(root) {
  const socket = new GameSocket();
  const messages = root.querySelector('#chat-messages');
  const status = root.querySelector('#chat-status');
  const players = root.querySelector('#chat-players');
  const form = root.querySelector('#chat-form');
  const input = root.querySelector('#chat-input');
  function line(value) {
    const node = document.createElement('p');
    node.textContent = value;
    messages.append(node);
    while (messages.children.length > 60) messages.firstChild.remove();
    messages.scrollTop = messages.scrollHeight;
  }
  socket.addEventListener('status', (event) => { status.textContent = event.detail; });
  socket.addEventListener('message', (event) => {
    const m = event.detail;
    if (m.type === 'chat') line(`${m.name}: ${m.text}`);
    if (m.type === 'players' || m.type === 'joined') players.textContent = `Гравці: ${m.players.join(', ')}`;
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (text && socket.send({ type: 'chat', text })) input.value = '';
    input.blur();
  });
  return {
    join(name, roomId) { messages.replaceChildren(); players.textContent = 'Гравці: —'; socket.connect(name, roomId); },
    leave() { socket.disconnect(); },
  };
}
