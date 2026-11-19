import { integrate, wrap, DT } from '../../../shared/simulation.ts';
import type { InputPacket, SnapshotEntity } from '../../../shared/types.ts';
export function reconcile(authoritative: SnapshotEntity, pending: readonly InputPacket[], ack: number,
  width: number, height: number): { state: SnapshotEntity; pending: InputPacket[] } {
  const rest = pending.filter((item) => item.seq > ack);
  let state = { ...authoritative };
  for (const input of rest) state = wrap(integrate(state, input, DT), width, height);
  return { state, pending: rest };
}
