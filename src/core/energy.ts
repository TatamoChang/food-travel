export const ENERGY_MAX = 20;
export const ENERGY_REGEN_MS = 60_000;

export interface EnergySnapshot {
  value: number;
  /** Time the regen timer last advanced; only meaningful while value < max. */
  updatedAt: number;
}

export class Energy {
  value: number;
  private updatedAt: number;

  constructor(
    snap: EnergySnapshot,
    public max = ENERGY_MAX,
    readonly regenMs = ENERGY_REGEN_MS,
  ) {
    this.value = snap.value;
    this.updatedAt = snap.updatedAt;
  }

  sync(now: number) {
    if (this.value >= this.max) {
      this.updatedAt = now;
      return;
    }
    const gained = Math.floor((now - this.updatedAt) / this.regenMs);
    if (gained <= 0) return;
    this.value = Math.min(this.max, this.value + gained);
    this.updatedAt = this.value >= this.max ? now : this.updatedAt + gained * this.regenMs;
  }

  spend(n: number, now: number): boolean {
    this.sync(now);
    if (this.value < n) return false;
    // Timer starts counting from the moment we drop below max.
    if (this.value >= this.max) this.updatedAt = now;
    this.value -= n;
    return true;
  }

  /** Change the cap. Regen up to now is settled against the old cap first, so a stale timer can't pay out at once. */
  setMax(n: number, now: number) {
    this.sync(now);
    this.max = n;
    if (this.value >= n) this.updatedAt = now;
  }

  /** Grant energy beyond the cap (purchases and rewards are not limited by max). */
  add(n: number, now: number) {
    this.sync(now);
    this.value += n;
  }

  /** Milliseconds until the next point is regenerated, or 0 when full. */
  msToNext(now: number): number {
    this.sync(now);
    if (this.value >= this.max) return 0;
    return Math.max(0, this.regenMs - (now - this.updatedAt));
  }

  snapshot(): EnergySnapshot {
    return { value: this.value, updatedAt: this.updatedAt };
  }
}
