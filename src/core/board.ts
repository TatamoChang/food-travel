import { mergeResult } from "./registry";

export const COLS = 6;
export const ROWS = 8;

export type Cell = string | null;

export type MoveResult =
  | { type: "invalid" }
  | { type: "moved" }
  | { type: "swapped" }
  | { type: "merged"; result: string };

export class Board {
  readonly cells: Cell[];

  constructor(cells?: readonly Cell[]) {
    this.cells = cells ? [...cells] : new Array<Cell>(COLS * ROWS).fill(null);
  }

  static col(i: number) {
    return i % COLS;
  }
  static row(i: number) {
    return Math.floor(i / COLS);
  }

  /** Empty cell closest to `from` (Manhattan distance, ties by lowest index). */
  nearestEmpty(from: number): number | null {
    let best: number | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] !== null) continue;
      const d = Math.abs(Board.col(i) - Board.col(from)) + Math.abs(Board.row(i) - Board.row(from));
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    }
    return best;
  }

  /** Put item in the empty cell nearest to `from`. Returns the cell index or null when the board is full. */
  spawnNear(itemId: string, from: number): number | null {
    const idx = this.nearestEmpty(from);
    if (idx === null) return null;
    this.cells[idx] = itemId;
    return idx;
  }

  remove(i: number) {
    this.cells[i] = null;
  }

  count(itemId: string): number {
    return this.cells.reduce((n, c) => (c === itemId ? n + 1 : n), 0);
  }

  /** Remove `n` copies of `itemId` (lowest index first). Returns false and changes nothing if fewer than `n` exist. */
  take(itemId: string, n: number): boolean {
    if (this.count(itemId) < n) return false;
    for (let i = 0; i < this.cells.length && n > 0; i++) {
      if (this.cells[i] === itemId) {
        this.cells[i] = null;
        n--;
      }
    }
    return true;
  }

  /** Drag item from `from` onto `to`: merge when allowed, otherwise move into empty cell or swap. */
  move(from: number, to: number): MoveResult {
    const a = this.cells[from];
    if (from === to || a == null || to < 0 || to >= this.cells.length) return { type: "invalid" };
    const b = this.cells[to];
    if (b == null) {
      this.cells[to] = a;
      this.cells[from] = null;
      return { type: "moved" };
    }
    const merged = mergeResult(a, b);
    if (merged) {
      this.cells[to] = merged;
      this.cells[from] = null;
      return { type: "merged", result: merged };
    }
    this.cells[from] = b;
    this.cells[to] = a;
    return { type: "swapped" };
  }
}
