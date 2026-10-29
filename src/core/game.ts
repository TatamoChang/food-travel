import { Board, type Cell } from "./board";
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
import { chains, generatorOutput, getChain, getItem } from "./registry";
import { mulberry32, type Rng } from "./rng";
import type { MoveResult } from "./board";

export interface ActiveBoost {
  productId: string;
  amount: number;
  /** Epoch ms when the boost ends. */
  expiresAt: number;
}

export interface GameState {
  board: Cell[];
  energy: EnergySnapshot;
  coins: number;
  /** Index into story.stages; equals stages.length once the story is finished. */
  stageIndex: number;
  unlocked: string[];
  randomOrders: RandomOrder[];
  nextOrderId: number;
  /** Generators that could not be placed because the board was full. */
  pendingGenerators: string[];
  /** Permanent energy-cap bonus from shop upgrades. */
  maxEnergyBonus: number;
  /** Ids of `once` products already bought. */
  purchased: string[];
  boosts: ActiveBoost[];
}

export type TapResult =
  | { ok: true; spawnedAt: number }
  | { ok: false; reason: "not-generator" | "no-energy" | "board-full" };

export type BuyResult = { ok: true } | { ok: false; reason: "unknown-product" | "no-coins" | "already-purchased" };

export type DeliverResult = { ok: false } | { ok: true; stageCompleted: boolean };

const cloneOrder = (o: RandomOrder): RandomOrder => ({ ...o, requirements: o.requirements.map((r) => ({ ...r })) });

export function newState(now: number): GameState {
  const board = new Board();
  board.cells[0] = getChain(story.initialUnlocked[0])!.generator.id;
  return {
    board: board.cells,
    energy: { value: 20, updatedAt: now },
    coins: 0,
    stageIndex: 0,
    unlocked: [...story.initialUnlocked],
    randomOrders: [],
    nextOrderId: 1,
    pendingGenerators: [],
    maxEnergyBonus: 0,
    purchased: [],
    boosts: [],
  };
}

export class Game {
  readonly board: Board;
  readonly energy: Energy;
  coins: number;
  stageIndex: number;
  unlocked: string[];
  randomOrders: RandomOrder[];
  private nextOrderId: number;
  private pendingGenerators: string[];
  private maxEnergyBonus: number;
  private purchased: string[];
  private boosts: ActiveBoost[];

  constructor(
    state?: GameState,
    private readonly now: () => number = Date.now,
    private readonly rng: Rng = mulberry32(Date.now()),
  ) {
    const s = state ?? newState(now());
    this.board = new Board(s.board);
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
    this.pendingGenerators = [...s.pendingGenerators];
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

  /** Tap the generator at `idx`: spends energy, spawns an A item in the nearest empty cell. */
  tap(idx: number): TapResult {
    this.tick();
    const id = this.board.cells[idx];
    const info = id ? getItem(id) : undefined;
    if (!id || info?.kind !== "generator") return { ok: false, reason: "not-generator" };
    const out = generatorOutput(id)!;
    const cost = getChain(info.chainId)!.generator.energyCost;
    if (this.board.nearestEmpty(idx) === null) return { ok: false, reason: "board-full" };
    if (!this.energy.spend(cost, this.now())) return { ok: false, reason: "no-energy" };
    return { ok: true, spawnedAt: this.board.spawnNear(out, idx)! };
  }

  move(from: number, to: number): MoveResult {
    return this.board.move(from, to);
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
    this.flushPending();
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

  /** Spend coins on a shop product and apply its effect. */
  buy(productId: string): BuyResult {
    this.tick();
    const product = getProduct(productId);
    if (!product) return { ok: false, reason: "unknown-product" };
    if (product.once && this.isPurchased(product.id)) return { ok: false, reason: "already-purchased" };
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
      pendingGenerators: [...this.pendingGenerators],
      maxEnergyBonus: this.maxEnergyBonus,
      purchased: [...this.purchased],
      boosts: this.boosts.map((b) => ({ ...b })),
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
    }
  }

  private completeStage(stage: StoryStage) {
    this.coins += stage.reward;
    this.energy.add(stage.rewardEnergy, this.now());
    for (const chainId of stage.unlocks) {
      if (this.unlocked.includes(chainId)) continue;
      this.unlocked.push(chainId);
      this.pendingGenerators.push(chains.find((c) => c.id === chainId)!.generator.id);
    }
    this.stageIndex++;
  }

  private flushPending() {
    this.pendingGenerators = this.pendingGenerators.filter((g) => this.board.spawnNear(g, 0) === null);
  }

  private refillRandomOrders() {
    while (this.randomOrders.length < RANDOM_ORDER_SLOTS) {
      this.randomOrders.push(generateRandomOrder(this.nextOrderId++, this.rng, this.unlocked, this.stageIndex));
    }
  }
}
