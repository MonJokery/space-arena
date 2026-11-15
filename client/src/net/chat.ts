import { GameSocket } from './socket.ts';
import { parseServerMessage } from '../../../shared/network.ts';

export function createChat(root: Document) {
  const socket = new GameSocket();
  const messages = root.querySelector<HTMLElement>('#chat-messages')!;
  const status = root.querySelector<HTMLElement>('#chat-status')!;
  const players = root.querySelector<HTMLElement>('#chat-players')!;
  const form = root.querySelector<HTMLFormElement>('#chat-form')!;
  const input = root.querySelector<HTMLInputElement>('#chat-input')!;
  function line(value: string): void {
    const node = document.createElement('p');
    node.textContent = value;
    messages.append(node);
    while (messages.children.length > 60) messages.firstChild?.remove();
    messages.scrollTop = messages.scrollHeight;
  }
  socket.addEventListener('status', (event) => { if (event instanceof CustomEvent) status.textContent = String(event.detail); });
  socket.addEventListener('message', (event) => {
    if (!(event instanceof CustomEvent)) return;
    const m: unknown = event.detail;
    if (!m || typeof m !== 'object' || !('type' in m)) return;
    const message = parseServerMessage(m);
    switch (message.type) {
      case 'chat': line(`${message.name}: ${message.text}`); break;
      case 'players': case 'joined': players.textContent = `Гравці: ${message.players.join(', ')}`; break;
      case 'snapshot': case 'pongTime': case 'gameEvent': break;
      default: { const exhaustive: never = message; throw new Error(`Unhandled ${JSON.stringify(exhaustive)}`); }
    }
  });
  form.addEventListener('submit', (event: SubmitEvent) => {
    event.preventDefault();
    const text = input.value.trim();
    if (text && socket.send({ type: 'chat', text })) input.value = '';
    input.blur();
  });
  return {
    join(name: string, roomId: string): void { messages.replaceChildren(); players.textContent = 'Гравці: —'; socket.connect(name, roomId); },
    leave(): void { socket.disconnect(); },
    socket,
  };
}
