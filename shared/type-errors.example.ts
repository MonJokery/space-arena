import type { EntityId, InputSeq, Tick, Vector2 } from './types.ts';
import { assertNever } from './types.ts';

declare const id: EntityId;
declare const seq: InputSeq;
declare const tick: Tick;
declare const position: Vector2;
declare function acknowledge(player: EntityId, sequence: InputSeq): void;

acknowledge(id, seq);
// @ts-expect-error InputSeq is not an EntityId.
acknowledge(seq, id);
// @ts-expect-error A step number is not a sequence number.
acknowledge(id, tick);
// @ts-expect-error Vector coordinates are readonly.
position.x = 100;

export function checkEvent(type: 'fired' | 'hit' | 'exploded'): string {
  switch (type) {
    case 'fired': return 'shoot';
    case 'hit': return 'damage';
    case 'exploded': return 'boom';
    default: return assertNever(type);
  }
}
