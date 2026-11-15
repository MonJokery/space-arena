import { Entity } from './entity.ts';
import { createPickup } from '../behaviors.ts';
import type { Vector2 } from '../vector2.ts';

export class Pickup extends Entity {
  effect: ReturnType<typeof createPickup>;
  constructor({ position, heal = 30 }: { position: Vector2; heal?: number }) {
    super({ position, radius: 14, kind: 'pickup' });
    this.effect = createPickup({ heal });
  }
  override update(): void {}
}
