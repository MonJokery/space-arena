import { Entity } from './entity.js';
import { createPickup } from '../behaviors.js';

export class Pickup extends Entity {
  constructor({ position, heal = 30 }) {
    super({ position, radius: 14, kind: 'pickup' });
    this.effect = createPickup({ heal });
  }
  update() { /* нерухомий об'єкт */ }
}
