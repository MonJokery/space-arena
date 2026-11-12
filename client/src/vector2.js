export class Vector2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  add(other) { return new Vector2(this.x + other.x, this.y + other.y); }
  subtract(other) { return new Vector2(this.x - other.x, this.y - other.y); }
  scale(number) { return new Vector2(this.x * number, this.y * number); }
  length() { return Math.hypot(this.x, this.y); }
  normalize() { const length = this.length(); return length === 0 ? new Vector2() : this.scale(1 / length); }
  distance(other) { return this.subtract(other).length(); }
  static fromAngle(angle) { return new Vector2(Math.cos(angle), Math.sin(angle)); }
}
