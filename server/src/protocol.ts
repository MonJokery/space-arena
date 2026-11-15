import { z } from 'zod';
import { inputSeq } from '../../shared/types.ts';
import type { InputPacket } from '../../shared/types.ts';

export const MAX_MESSAGE_BYTES = 4096;
const joined = z.strictObject({ type: z.literal('join'), name: z.string().trim().min(1).max(24), roomId: z.string().regex(/^[a-z0-9-]{1,24}$/) });
const input = z.strictObject({ type: z.literal('input'), seq: z.number().int().min(1).max(4294967295), thrust: z.boolean(), left: z.boolean(), right: z.boolean(), brake: z.boolean(), fire: z.boolean(), homing: z.boolean() });
const ping = z.strictObject({ type: z.literal('pingTime'), timestamp: z.number().finite() });
const chat = z.strictObject({ type: z.literal('chat'), text: z.string().trim().min(1).max(500) });
const leave = z.strictObject({ type: z.literal('leave') });
export const ClientMessageSchema = z.discriminatedUnion('type', [joined, input, ping, chat, leave]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export const RoomConfigSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{1,24}$/),
  name: z.string().trim().min(1).max(50),
  width: z.number().int().min(400).max(1920),
  height: z.number().int().min(300).max(1080),
  asteroids: z.number().int().min(0).max(30),
});
export type RoomConfig = z.infer<typeof RoomConfigSchema>;
export type ParsedClientMessage = Exclude<ClientMessage, { type: 'input' }> | InputPacket;
export function parseClientMessage(data: unknown): ParsedClientMessage {
  if (typeof data !== 'string') throw new Error('Message must be text');
  if (Buffer.byteLength(data) > MAX_MESSAGE_BYTES) throw new Error('Message too large');
  let parsed: unknown;
  try { parsed = JSON.parse(data); } catch { throw new Error('Invalid JSON'); }
  const result = ClientMessageSchema.safeParse(parsed);
  if (!result.success) throw new Error('Invalid message shape');
  if (result.data.type === 'input') return { ...result.data, seq: inputSeq(result.data.seq) };
  return result.data;
}
// Backward-compatible name for previous tests.
export const parseMessage = parseClientMessage;
