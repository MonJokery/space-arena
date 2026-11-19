import { z } from 'zod';
import { entityId, tickNumber, inputSeq } from './types.ts';
import type { EntityId, InputPacket, Snapshot, SnapshotEntity, GameEvent } from './types.ts';

const EntitySchema = z.object({
  id: z.number().int().nonnegative(),
  kind: z.enum(['ship', 'bullet', 'asteroid', 'pickup']),
  x: z.number().finite(), y: z.number().finite(),
  vx: z.number().finite(), vy: z.number().finite(),
  angle: z.number().finite(), radius: z.number().min(0),
  hp: z.number().finite(), score: z.number().finite(), deaths: z.number().finite(),
  homing: z.boolean(), invulnerable: z.number().finite(), owner: z.number().int().nonnegative(),
});
const SnapshotSchema = z.object({
  type: z.literal('snapshot'), tick: z.number().int().nonnegative(),
  entities: z.array(EntitySchema),
  acks: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])),
});
const MessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('joined'), roomId: z.string(), players: z.array(z.string()), playerId: z.number().int().nonnegative(), seed: z.number(), tickRate: z.number() }),
  z.object({ type: z.literal('players'), players: z.array(z.string()) }),
  z.object({ type: z.literal('chat'), name: z.string(), text: z.string(), time: z.number() }),
  z.object({ type: z.literal('pongTime'), timestamp: z.number() }),
  z.object({ type: z.literal('gameEvent'), eventType: z.enum(['fired','hit','exploded']), id: z.number().int().nonnegative() }),
  z.object({ type: z.literal('shutdown'), reason: z.string() }),
  SnapshotSchema,
]);
export type JoinedMessage = { type: 'joined'; roomId: string; players: string[]; playerId: EntityId; seed: number; tickRate: number };
export type ServerMessage = JoinedMessage | Snapshot |
  { type: 'players'; players: string[] } |
  { type: 'shutdown'; reason: string } |
  { type: 'chat'; name: string; text: string; time: number } |
  { type: 'pongTime'; timestamp: number } |
  { type: 'gameEvent'; eventType: GameEvent['type']; id: EntityId };
export type OutgoingMessage = InputPacket | { type: 'chat'; text: string } | { type: 'pingTime'; timestamp: number } | { type: 'leave' };

export function parseServerMessage(raw: unknown): ServerMessage {
  const message = MessageSchema.parse(raw);
  switch (message.type) {
    case 'joined': return { ...message, playerId: entityId(message.playerId) };
    case 'snapshot': return {
      type: 'snapshot', tick: tickNumber(message.tick),
      entities: message.entities.map((entity): SnapshotEntity => ({ ...entity, id: entityId(entity.id), owner: entityId(entity.owner) })),
      acks: message.acks.map(([id, seq]): [EntityId, ReturnType<typeof inputSeq>] => [entityId(id), inputSeq(seq)]),
    };
    case 'gameEvent': return { ...message, id: entityId(message.id) };
    case 'players': case 'chat': case 'pongTime': case 'shutdown': return message;
    default: {
      const unreachable: never = message;
      throw new Error(`Unhandled message: ${JSON.stringify(unreachable)}`);
    }
  }
}
