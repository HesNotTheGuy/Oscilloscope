'use strict';

// ─────────────────────────────────────────────────────────────
//  SnakeGame — easter egg. Hijacks the WaveGL renderer to
//  draw a snake game using the same beam/glow pipeline as the
//  scope. Activated by the Konami code, exited with Escape or
//  on game over.
// ─────────────────────────────────────────────────────────────
export class SnakeGame {
  constructor(W, H) {
    this.W = W;
    this.H = H;
    this.cell = 40;            // cell size in canvas pixels
    this.cols = Math.floor(W / this.cell);
    this.rows = Math.floor(H / this.cell);
    this.tickMs = 110;         // movement interval
    this._lastTick = 0;
    this.reset();
  }

  reset() {
    const cx = Math.floor(this.cols / 2);
    const cy = Math.floor(this.rows / 2);
    this.snake = [
      { x: cx,     y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
    ];
    this.dir     = { x: 1, y: 0 };
    this.nextDir = { x: 1, y: 0 };
    this.food    = this._randomFood();
    this.score   = 0;
    this.alive   = true;
    this._deathFrame = 0;
  }

  _randomFood() {
    // Pick a cell not on the snake
    while (true) {
      const f = {
        x: Math.floor(Math.random() * this.cols),
        y: Math.floor(Math.random() * this.rows),
      };
      if (!this.snake.some(s => s.x === f.x && s.y === f.y)) return f;
    }
  }

  // Direction input — prevents 180° reversal
  setDir(dx, dy) {
    if (dx === -this.dir.x && dy === -this.dir.y) return;
    this.nextDir = { x: dx, y: dy };
  }

  update(now) {
    if (!this.alive) {
      this._deathFrame++;
      return;
    }
    if (now - this._lastTick < this.tickMs) return;
    this._lastTick = now;

    this.dir = this.nextDir;
    const head = this.snake[0];
    const nx = head.x + this.dir.x;
    const ny = head.y + this.dir.y;

    // Wall collision
    if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) {
      this.alive = false;
      return;
    }
    // Self collision
    if (this.snake.some(s => s.x === nx && s.y === ny)) {
      this.alive = false;
      return;
    }

    this.snake.unshift({ x: nx, y: ny });

    // Food
    if (nx === this.food.x && ny === this.food.y) {
      this.score++;
      this.food = this._randomFood();
      // Speed up slightly per food (cap at 60ms)
      this.tickMs = Math.max(60, this.tickMs - 3);
    } else {
      this.snake.pop();
    }
  }

  // Returns point sets to feed glr.frame(): main snake polyline + food cross
  buildPointSets() {
    const c = this.cell;
    const half = c / 2;

    // Snake body: polyline through cell centers
    const body = this.snake.map(s => [s.x * c + half, s.y * c + half]);

    // Food: drawn as a small + cross (two short polylines)
    const fx = this.food.x * c + half;
    const fy = this.food.y * c + half;
    const r  = c * 0.3;
    const foodH = [[fx - r, fy], [fx + r, fy]];
    const foodV = [[fx, fy - r], [fx, fy + r]];

    // Border rectangle so the playfield is visible
    const W = this.cols * c;
    const H = this.rows * c;
    const border = [
      [0, 0], [W, 0], [W, H], [0, H], [0, 0],
    ];

    return [body, foodH, foodV, border];
  }
}

// Konami code detector — invokes onMatch when sequence completes.
// Returns a function suitable for window keydown listener.
export function makeKonamiDetector(onMatch) {
  const SEQ = [
    'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
    'b', 'a',
  ];
  let idx = 0;
  return function(e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === SEQ[idx]) {
      idx++;
      if (idx === SEQ.length) {
        idx = 0;
        onMatch();
      }
    } else {
      // Allow restart from beginning if first key matches
      idx = (k === SEQ[0]) ? 1 : 0;
    }
  };
}
