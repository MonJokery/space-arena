import { Vector2 } from '../vector2.js';

export class Entity {
  static #id = 0;
  constructor({ position = new Vector2(), velocity = new Vector2(), radius = 10, kind = 'entity' } = {}) {
    this.id = ++Entity.#id;
    this.position = position;
    this.previousPosition = position;
    this.velocity = velocity;
    this.radius = radius;
    this.kind = kind;
    this.dead = false;
  }
  update(dt, world) {
    this.position = world.wrap(this.position.add(this.velocity.scale(dt)));
  }
}
