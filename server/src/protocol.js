export const MAX_MESSAGE_BYTES = 4096;

export function parseMessage(data) {
  if (Buffer.byteLength(data) > MAX_MESSAGE_BYTES) throw new Error('Message too large');
  let message;
  try { message = JSON.parse(data.toString()); }
  catch { throw new Error('Invalid JSON'); }
  if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') throw new Error('Invalid message shape');
  if (message.type === 'join') {
    if (Object.keys(message).sort().join(',') !== 'name,roomId,type' || typeof message.name !== 'string' || typeof message.roomId !== 'string' || message.name.trim().length < 1 || message.name.length > 24 || !/^[a-z0-9-]{1,24}$/.test(message.roomId)) throw new Error('Invalid join');
    return { type: 'join', name: message.name.trim(), roomId: message.roomId };
  }
  if (message.type === 'chat') {
    if (Object.keys(message).sort().join(',') !== 'text,type' || typeof message.text !== 'string' || !message.text.trim() || message.text.length > 500) throw new Error('Invalid chat');
    return { type: 'chat', text: message.text.trim() };
  }
  if (message.type === 'leave') {
    if (Object.keys(message).sort().join(',') !== 'type') throw new Error('Invalid leave');
    return { type: 'leave' };
  }
  throw new Error('Unknown message type');
}
