import { Vector2 } from '../vector2.ts';
import type { World } from '../world.ts';

export type EntityKind = 'entity' | 'ship' | 'bullet' | 'asteroid' | 'pickup' | 'particle';
export type EntityOptions = { position?: Vector2; velocity?: Vector2; radius?: number; kind?: EntityKind };
export class Entity {
  static #id = 0;
  id: number;
  position: Vector2;
  previousPosition: Vector2;
  velocity: Vector2;
  radius: number;
  kind: EntityKind;
  dead = false;
  constructor({ position = new Vector2(), velocity = new Vector2(), radius = 10, kind = 'entity' }: EntityOptions = {}) {
    this.id = ++Entity.#id;
    this.position = position;
    this.previousPosition = position;
    this.velocity = velocity;
    this.radius = radius;
    this.kind = kind;
  }
  update(dt: number, world: World): void {
    this.position = world.wrap(this.position.add(this.velocity.scale(dt)));
  }
}
