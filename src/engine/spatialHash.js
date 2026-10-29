// Broad phase only: callers retain narrow-phase geometry and lifecycle checks.
export class SpatialHash {
  constructor(cellSize = 64, maxCells = 256) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error('Invalid spatial cell size');
    this.cellSize = cellSize; this.maxCells = maxCells;
    this.cells = new Map(); this.entries = new Map(); this.large = new Set();
  }
  range(box) {
    if (![box.left, box.top, box.right, box.bottom].every(Number.isFinite) || box.left > box.right || box.top > box.bottom) throw new Error('Invalid AABB');
    return { x0: Math.floor(box.left / this.cellSize), y0: Math.floor(box.top / this.cellSize), x1: Math.floor(box.right / this.cellSize), y1: Math.floor(box.bottom / this.cellSize) };
  }
  remove(id) {
    const entry = this.entries.get(id);
    if (!entry) return;
    for (const key of entry.keys) { const cell = this.cells.get(key); cell.delete(id); if (!cell.size) this.cells.delete(key); }
    this.large.delete(id); this.entries.delete(id);
  }
  insert(id, box) { return this.update(id, box); }
  update(id, box) {
    const r = this.range(box); this.remove(id);
    const entry = { box: { ...box }, keys: [] }; this.entries.set(id, entry);
    if ((r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) > this.maxCells) { this.large.add(id); return; }
    for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) {
      const key = `${x},${y}`; entry.keys.push(key);
      if (!this.cells.has(key)) this.cells.set(key, new Set());
      this.cells.get(key).add(id);
    }
  }
  queryAabb(box) {
    const r = this.range(box), ids = new Set(this.large);
    const count = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
    if (count > this.maxCells) {
      // Huge query: inspect entries, never iterate billions of empty cells.
      for (const id of this.entries.keys()) ids.add(id);
    } else for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) {
      for (const id of this.cells.get(`${x},${y}`) || []) ids.add(id);
    }
    return [...ids].filter(id => {
      const b = this.entries.get(id).box;
      return b.left <= box.right && b.right >= box.left && b.top <= box.bottom && b.bottom >= box.top;
    }).sort((a, b) => a - b);
  }
}
