export class Vector2 {
  readonly x: number;
  readonly y: number;
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  add(other: Vector2): Vector2 { return new Vector2(this.x + other.x, this.y + other.y); }
  subtract(other: Vector2): Vector2 { return new Vector2(this.x - other.x, this.y - other.y); }
  scale(number: number): Vector2 { return new Vector2(this.x * number, this.y * number); }
  length(): number { return Math.hypot(this.x, this.y); }
  normalize(): Vector2 { const length = this.length(); return length === 0 ? new Vector2() : this.scale(1 / length); }
  distance(other: Vector2): number { return this.subtract(other).length(); }
  static fromAngle(angle: number): Vector2 { return new Vector2(Math.cos(angle), Math.sin(angle)); }
}
