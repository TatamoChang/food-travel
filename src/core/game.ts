import { Board, COLS, ROWS, type Cell } from "./board";
import { ENERGY_MAX, Energy, type EnergySnapshot } from "./energy";
import {
  RANDOM_ORDER_SLOTS,
  generateRandomOrder,
  story,
  type RandomOrder,
  type Requirement,
  type StoryStage,
} from "./orders";
import { getProduct, type ProductEffect } from "./shop";
import { generatorOutput, getAnyChain, getChain, getItem, stationOf } from "./registry";
import { mulberry32, type Rng } from "./rng";
import type { MoveResult } from "./board";
import type { StationId } from "./types";

export type { StationId };

export const STATIONS: readonly StationId[] = ["prep", "spice"];
/** Slots per station (the top row of the screen: 3 prep + 3 spice). */
export const STATION_SLOTS = 3;
/** Slots open at the start; the rest are bought in the shop. */
export const STATION_SLOTS_OPEN = 1;
/** Old saves had a 6x8 board whose top row is now the stations. */
const LEGACY_BOARD_CELLS = COLS * (ROWS + 1);

export interface ActiveBoost {
  productId: string;
  amount: number;
  /** Epoch ms when the boost ends. */
  expiresAt: number;
}

export interface GameState {
  /** Normal grid, COLS x ROWS. */
  board: Cell[];
  energy: EnergySnapshot;
  coins: number;
  /** Index into story.stages; equals stages.length once the story is finished. */
  stageIndex: number;
  /** Unlocked dish and seasoning chain ids. */
  unlocked: string[];
  randomOrders: RandomOrder[];
  nextOrderId: number;
  /** Permanent energy-cap bonus from shop upgrades. */
  maxEnergyBonus: number;
  /** Ids of `once` products already bought. */
  purchased: string[];
  boosts: ActiveBoost[];
  /** Generators on each station, STATION_SLOTS entries each. */
  stations: Record<StationId, Cell[]>;
  /** Open slot count per station. */
  slotsOpen: Record<StationId, number>;
  /** Unlimited storage: generators that are not on a station, and items moved off the board by save migration. */
  warehouse: string[];
}

/** What may come out of localStorage: current saves, or older ones that lack newer fields. */
export type SavedState = Omit<GameState, "maxEnergyBonus" | "purchased" | "boosts" | "stations" | "slotsOpen" | "warehouse"> &
  Partial<GameState> & {
    /** v1 field: generators waiting for a free board cell. */
    pendingGenerators?: string[];
  };

export type TapResult =
  | { ok: true; spawnedAt: number }
  | { ok: false; reason: "not-generator" | "no-energy" | "board-full" };

export type BuyResult =
  | { ok: true }
  | { ok: false; reason: "unknown-product" | "no-coins" | "already-purchased" | "requires-other" };

export type DeliverResult = { ok: false } | { ok: true; stageCompleted: boolean };

const cloneOrder = (o: RandomOrder): RandomOrder => ({ ...o, requirements: o.requirements.map((r) => ({ ...r })) });

const emptyStation = (): Cell[] => new Array<Cell>(STATION_SLOTS).fill(null);

export function newState(now: number): GameState {
  const prep = emptyStation();
  prep[0] = getChain(story.initialUnlocked[0])!.generator.id;
  return {
    board: new Board().cells,
    energy: { value: 20, updatedAt: now },
    coins: 0,
    stageIndex: 0,
    unlocked: [...story.initialUnlocked],
    randomOrders: [],
    nextOrderId: 1,
    maxEnergyBonus: 0,
    purchased: [],
    boosts: [],
    stations: { prep, spice: emptyStation() },
    slotsOpen: { prep: STATION_SLOTS_OPEN, spice: STATION_SLOTS_OPEN },
    warehouse: [],
  };
}

export class Game {
  readonly board: Board;
  readonly energy: Energy;
  coins: number;
  stageIndex: number;
  unlocked: string[];
  randomOrders: RandomOrder[];
  readonly stations: Record<StationId, Cell[]>;
  readonly slotsOpen: Record<StationId, number>;
  readonly warehouse: string[];
  private nextOrderId: number;
  private maxEnergyBonus: number;
  private purchased: string[];
  private boosts: ActiveBoost[];

  constructor(
    state?: SavedState,
    private readonly now: () => number = Date.now,
    private readonly rng: Rng = mulberry32(Date.now()),
  ) {
    const s: SavedState = state ?? newState(now());
    // Saves from before shop upgrades lack these fields.
    this.maxEnergyBonus = s.maxEnergyBonus ?? 0;
    this.purchased = [...(s.purchased ?? [])];
    this.boosts = (s.boosts ?? []).filter((b) => b.expiresAt > now()).map((b) => ({ ...b }));
    this.energy = new Energy(s.energy, this.currentMax(now()));
    this.coins = s.coins;
    this.stageIndex = s.stageIndex;
    this.unlocked = [...s.unlocked];
    this.randomOrders = s.randomOrders.map(cloneOrder);
    this.nextOrderId = s.nextOrderId;
    // Saves from before the stations lack these fields.
    this.stations = { prep: [...(s.stations?.prep ?? emptyStation())], spice: [...(s.stations?.spice ?? emptyStation())] };
    this.slotsOpen = { prep: s.slotsOpen?.prep ?? STATION_SLOTS_OPEN, spice: s.slotsOpen?.spice ?? STATION_SLOTS_OPEN };
    this.warehouse = [...(s.warehouse ?? [])];

    if (s.board.length === LEGACY_BOARD_CELLS) {
      this.board = new Board(s.board.slice(COLS));
      this.migrateLegacyBoard(s.board.slice(0, COLS), s.pendingGenerators ?? []);
    } else {
      this.board = new Board(s.board);
    }
    this.catchUpUnlocks();
    this.refillRandomOrders();
  }

  get storyCompleted(): boolean {
    return this.stageIndex >= story.stages.length;
  }

  get currentStage(): StoryStage | null {
    return story.stages[this.stageIndex] ?? null;
  }

  private currentMax(t: number): number {
    return ENERGY_MAX + this.maxEnergyBonus + this.boosts.reduce((n, b) => (b.expiresAt > t ? n + b.amount : n), 0);
  }

  /** Drop expired boosts and apply the resulting energy cap. Call regularly (e.g. every frame). */
  tick() {
    const t = this.now();
    this.boosts = this.boosts.filter((b) => b.expiresAt > t);
    const max = this.currentMax(t);
    if (max !== this.energy.max) this.energy.setMax(max, t);
  }

  isPurchased(productId: string): boolean {
    return this.purchased.includes(productId);
  }

  /** Epoch ms when the boost from `productId` ends, or null when not active. */
  boostExpiresAt(productId: string): number | null {
    return this.boosts.find((b) => b.productId === productId)?.expiresAt ?? null;
  }

  /** Board cell an item from this station slot spawns closest to: the top cell of the same screen column. */
  static spawnOrigin(station: StationId, slot: number): number {
    return (station === "prep" ? 0 : STATION_SLOTS) + slot;
  }

  /** Tap the generator in a station slot: spends energy, spawns its first item in the nearest empty board cell. */
  tapStation(station: StationId, slot: number): TapResult {
    this.tick();
    const id = this.stations[station][slot];
    const info = id ? getItem(id) : undefined;
    if (!id || info?.kind !== "generator") return { ok: false, reason: "not-generator" };
    const origin = Game.spawnOrigin(station, slot);
    const cost = getAnyChain(info.chainId)!.generator.energyCost;
    if (this.board.nearestEmpty(origin) === null) return { ok: false, reason: "board-full" };
    if (!this.energy.spend(cost, this.now())) return { ok: false, reason: "no-energy" };
    return { ok: true, spawnedAt: this.board.spawnNear(generatorOutput(id)!, origin)! };
  }

  move(from: number, to: number): MoveResult {
    return this.board.move(from, to);
  }

  /** True when the station slot holds a generator that can go back to the warehouse. */
  canStore(station: StationId, slot: number): boolean {
    return slot < this.slotsOpen[station] && this.stations[station][slot] !== null;
  }

  /** Move a station's generator into the warehouse to free the slot. */
  storeFromStation(station: StationId, slot: number): boolean {
    if (!this.canStore(station, slot)) return false;
    this.warehouse.push(this.stations[station][slot]!);
    this.stations[station][slot] = null;
    return true;
  }

  /** True when warehouse entry `index` has somewhere to go: a free slot on its station, or a free board cell for items. */
  canPlace(index: number): boolean {
    const id = this.warehouse[index];
    if (id === undefined) return false;
    if (getItem(id)?.kind === "generator") return this.freeSlot(stationOf(id)) !== null;
    return this.board.nearestEmpty(0) !== null;
  }

  /** Take warehouse entry `index` out: generators onto their station, items onto the board. */
  placeFromWarehouse(index: number): boolean {
    if (!this.canPlace(index)) return false;
    const [id] = this.warehouse.splice(index, 1);
    if (getItem(id)?.kind === "generator") this.stations[stationOf(id)][this.freeSlot(stationOf(id))!] = id;
    else this.board.spawnNear(id, 0);
    return true;
  }

  /** True when the board holds every item the requirements ask for. */
  canFulfil(reqs: readonly Requirement[]): boolean {
    return reqs.every((r) => this.board.count(r.itemId) >= r.count);
  }

  canDeliverStory(): boolean {
    const stage = this.currentStage;
    return !!stage && this.canFulfil(stage.requirements);
  }

  canDeliverRandom(orderId: number): boolean {
    const order = this.randomOrders.find((o) => o.id === orderId);
    return !!order && this.canFulfil(order.requirements);
  }

  /** All-or-nothing: consumes every required item from the board and finishes the stage. */
  deliverStory(): DeliverResult {
    const stage = this.currentStage;
    if (!stage || !this.canFulfil(stage.requirements)) return { ok: false };
    for (const r of stage.requirements) this.board.take(r.itemId, r.count);
    this.completeStage(stage);
    return { ok: true, stageCompleted: true };
  }

  /** All-or-nothing: consumes the order's items, pays coins, and refills the slot. */
  deliverRandom(orderId: number): DeliverResult {
    const order = this.randomOrders.find((o) => o.id === orderId);
    if (!order || !this.canFulfil(order.requirements)) return { ok: false };
    for (const r of order.requirements) this.board.take(r.itemId, r.count);
    this.coins += order.reward;
    this.randomOrders = this.randomOrders.filter((o) => o.id !== orderId);
    this.refillRandomOrders();
    return { ok: true, stageCompleted: false };
  }

  /** Product that must be bought before `productId`, while it has not been; null when nothing blocks it. */
  missingRequirement(productId: string): string | null {
    const req = getProduct(productId)?.requires;
    return req && !this.isPurchased(req) ? req : null;
  }

  /** Spend coins on a shop product and apply its effect. */
  buy(productId: string): BuyResult {
    this.tick();
    const product = getProduct(productId);
    if (!product) return { ok: false, reason: "unknown-product" };
    if (product.once && this.isPurchased(product.id)) return { ok: false, reason: "already-purchased" };
    if (this.missingRequirement(product.id)) return { ok: false, reason: "requires-other" };
    if (this.coins < product.cost) return { ok: false, reason: "no-coins" };
    this.coins -= product.cost;
    if (product.once) this.purchased.push(product.id);
    this.applyEffect(product.id, product.effect);
    this.tick();
    return { ok: true };
  }

  snapshot(): GameState {
    return {
      board: [...this.board.cells],
      energy: this.energy.snapshot(),
      coins: this.coins,
      stageIndex: this.stageIndex,
      unlocked: [...this.unlocked],
      randomOrders: this.randomOrders.map(cloneOrder),
      nextOrderId: this.nextOrderId,
      maxEnergyBonus: this.maxEnergyBonus,
      purchased: [...this.purchased],
      boosts: this.boosts.map((b) => ({ ...b })),
      stations: { prep: [...this.stations.prep], spice: [...this.stations.spice] },
      slotsOpen: { ...this.slotsOpen },
      warehouse: [...this.warehouse],
    };
  }

  private applyEffect(productId: string, effect: ProductEffect) {
    switch (effect.type) {
      case "energy":
        this.energy.add(effect.amount, this.now());
        break;
      case "maxEnergy":
        this.maxEnergyBonus += effect.amount;
        break;
      case "maxEnergyBoost": {
        const t = this.now();
        const active = this.boosts.find((b) => b.productId === productId);
        if (active) active.expiresAt += effect.durationMinutes * 60_000;
        else this.boosts.push({ productId, amount: effect.amount, expiresAt: t + effect.durationMinutes * 60_000 });
        break;
      }
      case "openSlot":
        this.slotsOpen[effect.station] = Math.min(STATION_SLOTS, this.slotsOpen[effect.station] + 1);
        break;
    }
  }

  private freeSlot(station: StationId): number | null {
    const i = this.stations[station].findIndex((c, slot) => c === null && slot < this.slotsOpen[station]);
    return i < 0 ? null : i;
  }

  /** Put a generator on its station, or in the warehouse when the station is full. */
  private stowGenerator(id: string) {
    const station = stationOf(id);
    const slot = this.freeSlot(station);
    if (slot === null) this.warehouse.push(id);
    else this.stations[station][slot] = id;
  }

  private unlock(chainId: string) {
    if (this.unlocked.includes(chainId)) return;
    this.unlocked.push(chainId);
    this.stowGenerator(getAnyChain(chainId)!.generator.id);
  }

  private completeStage(stage: StoryStage) {
    this.coins += stage.reward;
    this.energy.add(stage.rewardEnergy, this.now());
    for (const chainId of stage.unlocks) this.unlock(chainId);
    this.stageIndex++;
  }

  /** Grant unlocks of stages already finished, e.g. seasonings added to story.json after the save was made. */
  private catchUpUnlocks() {
    for (const stage of story.stages.slice(0, this.stageIndex)) {
      for (const chainId of stage.unlocks) this.unlock(chainId);
    }
  }

  /**
   * v1 saves: the old top row became the stations. Generators anywhere (old top row, board, pending)
   * go onto stations or into the warehouse; other items from the old top row move to the nearest free
   * board cell, or into the warehouse when the board is full.
   */
  private migrateLegacyBoard(topRow: readonly Cell[], pending: readonly string[]) {
    const isGen = (id: string) => getItem(id)?.kind === "generator";
    const gens = topRow.filter((c): c is string => c !== null && isGen(c));
    this.board.cells.forEach((c, i) => {
      if (c !== null && isGen(c)) {
        gens.push(c);
        this.board.remove(i);
      }
    });
    for (const g of [...gens, ...pending]) this.stowGenerator(g);
    for (const c of topRow) {
      if (c === null || isGen(c)) continue;
      if (this.board.spawnNear(c, 0) === null) this.warehouse.push(c);
    }
  }

  private refillRandomOrders() {
    while (this.randomOrders.length < RANDOM_ORDER_SLOTS) {
      this.randomOrders.push(generateRandomOrder(this.nextOrderId++, this.rng, this.unlocked, this.stageIndex));
    }
  }
}
