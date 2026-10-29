import { Board, type Cell } from "./board";
import { Energy, type EnergySnapshot } from "./energy";
import {
  RANDOM_ORDER_SLOTS,
  generateRandomOrder,
  story,
  type RandomOrder,
  type Requirement,
  type StoryStage,
} from "./orders";
import { chains, generatorOutput, getChain, getItem } from "./registry";
import { mulberry32, type Rng } from "./rng";
import type { MoveResult } from "./board";

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
}

export type TapResult =
  | { ok: true; spawnedAt: number }
  | { ok: false; reason: "not-generator" | "no-energy" | "board-full" };

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

  constructor(
    state?: GameState,
    private readonly now: () => number = Date.now,
    private readonly rng: Rng = mulberry32(Date.now()),
  ) {
    const s = state ?? newState(now());
    this.board = new Board(s.board);
    this.energy = new Energy(s.energy);
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

  /** Tap the generator at `idx`: spends energy, spawns an A item in the nearest empty cell. */
  tap(idx: number): TapResult {
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
    };
  }

  private completeStage(stage: StoryStage) {
    this.coins += stage.reward;
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
