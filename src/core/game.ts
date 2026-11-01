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
import { getProduct, products, purchaseLimit, themeProduct, type Product, type ProductEffect } from "./shop";
import { generatorOutput, getAnyChain, getChain, getItem, recipeFor, rewardValue, stationOf } from "./registry";
import { SHARDS_NEEDED, SHARD_RECIPE, getTask, taskProgress, tasks, type TaskDef } from "./tasks";
import { mulberry32, type Rng } from "./rng";
import type { MoveResult } from "./board";
import type { StationId } from "./types";

export type { StationId };

export const STATIONS: readonly StationId[] = ["prep", "spice"];
/** Slots per station; together they fill the top row of the screen (5 prep + 1 spice). */
export const STATION_SLOTS: Record<StationId, number> = { prep: 5, spice: 1 };
/** Merging into a dish of at least this stage (C) may drop a coin; at least this stage (B) may drop energy. */
export const COIN_DROP_MIN_STAGE = 2;
export const ENERGY_DROP_MIN_STAGE = 1;
/** Base chance per merge, plus DROP_BOSS_BONUS for each boss stage cleared. */
export const COIN_DROP_CHANCE = 0.1;
export const ENERGY_DROP_CHANCE = 0.05;
export const DROP_BOSS_BONUS = 0.05;

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
  /** Ids of limited products, once per purchase (a product bought twice appears twice). */
  purchased: string[];
  boosts: ActiveBoost[];
  /** Generators on each station, STATION_SLOTS entries each. */
  stations: Record<StationId, Cell[]>;
  /** Unlimited storage: generators that are not on a station, and items moved off the board by save migration. */
  warehouse: string[];
  /** Unlocked special recipes (result item ids). Daily recipes need no unlock. */
  unlockedRecipes: string[];
  /** Times each item id was produced by a merge (for tasks). */
  made: Record<string, number>;
  /** Random orders delivered in total (for tasks). */
  randomDelivered: number;
  /** Boss-stage recipe shards collected. */
  shards: number;
  /** Ids of completed tasks (their reward has been given). */
  doneTasks: string[];
}

/** What may come out of localStorage: current saves, or older ones that lack newer fields. */
export type SavedState = Omit<
  GameState,
  "maxEnergyBonus" | "purchased" | "boosts" | "stations" | "warehouse" | "unlockedRecipes" | "made" | "randomDelivered" | "shards" | "doneTasks"
> &
  Partial<GameState> & {
    /** v1 field: generators waiting for a free board cell. */
    pendingGenerators?: string[];
  };

/** How a prep slot opens: clearing a stage (1-based), completing a task, or buying a product. */
export type SlotSource = { kind: "stage"; stage: number } | { kind: "task"; task: TaskDef } | { kind: "shop"; product: Product };

/**
 * Sources of prep slots 2..5 in the order they open (slot 0 is always open): stages marked
 * opensPrepSlot, then tasks with rewardPrepSlot, then openPrepSlot products (which require that task).
 */
export const PREP_SLOT_SOURCES: readonly SlotSource[] = [
  ...story.stages.flatMap((s, i): SlotSource[] => (s.opensPrepSlot ? [{ kind: "stage", stage: i + 1 }] : [])),
  ...tasks.filter((t) => t.rewardPrepSlot).map((task): SlotSource => ({ kind: "task", task })),
  ...products.filter((p) => p.effect.type === "openPrepSlot").map((product): SlotSource => ({ kind: "shop", product })),
];

/** What opens prep slot `slot` (0-based); null for the first slot. */
export function prepSlotSource(slot: number): SlotSource | null {
  return PREP_SLOT_SOURCES[slot - 1] ?? null;
}

export type TapResult =
  | { ok: true; spawnedAt: number }
  | { ok: false; reason: "not-generator" | "no-energy" | "board-full" };

export type BuyResult =
  | { ok: true }
  | { ok: false; reason: "unknown-product" | "no-coins" | "already-purchased" | "requires-other" };

export type DeliverResult = { ok: false } | { ok: true; stageCompleted: boolean };

const cloneOrder = (o: RandomOrder): RandomOrder => ({ ...o, requirements: o.requirements.map((r) => ({ ...r })) });

const emptyStation = (station: StationId): Cell[] => new Array<Cell>(STATION_SLOTS[station]).fill(null);

export function newState(now: number): GameState {
  const prep = emptyStation("prep");
  prep[0] = getChain(story.initialUnlocked[0])!.generator.id;
  return {
    board: new Board().cells,
    energy: { value: ENERGY_MAX, updatedAt: now },
    coins: 0,
    stageIndex: 0,
    unlocked: [...story.initialUnlocked],
    randomOrders: [],
    nextOrderId: 1,
    maxEnergyBonus: 0,
    purchased: [],
    boosts: [],
    stations: { prep, spice: emptyStation("spice") },
    warehouse: [],
    unlockedRecipes: [],
    made: {},
    randomDelivered: 0,
    shards: 0,
    doneTasks: [],
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
  readonly warehouse: string[];
  readonly unlockedRecipes: string[];
  readonly made: Record<string, number>;
  randomDelivered: number;
  shards: number;
  readonly doneTasks: string[];
  /** Short messages for the player (unlocks etc.); the view shows and clears them. */
  readonly notices: string[] = [];
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
    // Saves from before the stations / recipes lack these fields.
    this.warehouse = [...(s.warehouse ?? [])];
    this.stations = { prep: this.fitStation("prep", s.stations?.prep), spice: this.fitStation("spice", s.stations?.spice) };
    this.unlockedRecipes = [...(s.unlockedRecipes ?? [])];
    this.made = { ...(s.made ?? {}) };
    this.randomDelivered = s.randomDelivered ?? 0;
    this.shards = s.shards ?? 0;
    this.doneTasks = [...(s.doneTasks ?? [])];

    if (s.board.length === LEGACY_BOARD_CELLS) {
      this.board = new Board(s.board.slice(COLS));
      this.migrateLegacyBoard(s.board.slice(0, COLS), s.pendingGenerators ?? []);
    } else {
      this.board = new Board(s.board);
    }
    this.catchUpUnlocks();
    this.checkProgress();
    this.notices.length = 0;
    this.refillRandomOrders();
  }

  /** Open slots per station: prep starts with 1 and gains one per source reached (see PREP_SLOT_SOURCES); spice has 1. */
  get slotsOpen(): Record<StationId, number> {
    const opened = PREP_SLOT_SOURCES.filter((src) => this.slotSourceReached(src)).length;
    return { prep: Math.min(STATION_SLOTS.prep, 1 + opened), spice: STATION_SLOTS.spice };
  }

  /** What will open locked prep slot `slot`: the not-yet-reached sources, in order, fill the locked slots left to right. */
  lockedSlotSource(slot: number): SlotSource | null {
    const pending = PREP_SLOT_SOURCES.filter((src) => !this.slotSourceReached(src));
    return slot < this.slotsOpen.prep ? null : (pending[slot - this.slotsOpen.prep] ?? null);
  }

  private slotSourceReached(src: SlotSource): boolean {
    if (src.kind === "stage") return this.stageIndex >= src.stage;
    if (src.kind === "task") return this.doneTasks.includes(src.task.id);
    return this.isPurchased(src.product.id);
  }

  /** Station contents resized to its slot count; generators that no longer fit go to the warehouse. */
  private fitStation(station: StationId, saved: readonly Cell[] | undefined): Cell[] {
    const cells = emptyStation(station);
    (saved ?? []).forEach((id, i) => {
      if (id === null) return;
      if (i < cells.length) cells[i] = id;
      else this.warehouse.push(id);
    });
    return cells;
  }

  isRecipeUnlocked(resultId: string): boolean {
    return recipeFor(resultId)?.tier === "daily" || this.unlockedRecipes.includes(resultId);
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

  /** Free themes (no product) are always owned; paid ones once their product is bought. */
  isThemeOwned(themeId: string): boolean {
    const p = themeProduct(themeId);
    return !p || this.isPurchased(p.id);
  }

  purchaseCount(productId: string): number {
    return this.purchased.filter((id) => id === productId).length;
  }

  /** Epoch ms when the boost from `productId` ends, or null when not active. */
  boostExpiresAt(productId: string): number | null {
    return this.boosts.find((b) => b.productId === productId)?.expiresAt ?? null;
  }

  /** Board cell an item from this station slot spawns closest to: the top cell of the same screen column. */
  static spawnOrigin(station: StationId, slot: number): number {
    return (station === "prep" ? 0 : STATION_SLOTS.prep) + slot;
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

  /** Drag on the board; counts merges for tasks and may drop coins or energy next to the result. */
  move(from: number, to: number): MoveResult {
    const r = this.board.move(from, to, (id) => this.isRecipeUnlocked(id));
    if (r.type === "merged") {
      this.made[r.result] = (this.made[r.result] ?? 0) + 1;
      this.rollDrops(r.result, to);
      this.checkProgress();
    }
    return r;
  }

  /** Boss stages completed so far. */
  get bossesCleared(): number {
    return story.stages.slice(0, this.stageIndex).filter((s) => s.boss).length;
  }

  /** Current drop chances per qualifying merge. */
  get dropChances(): { coin: number; energy: number } {
    const bonus = DROP_BOSS_BONUS * this.bossesCleared;
    return { coin: COIN_DROP_CHANCE + bonus, energy: ENERGY_DROP_CHANCE + bonus };
  }

  /** Dish merges may drop a grade-1 coin (stage C+) and/or energy (stage B+) into the nearest empty cell; nothing drops when the board is full. */
  private rollDrops(result: string, at: number) {
    const info = getItem(result)!;
    if (info.category !== "dish") return;
    const chance = this.dropChances;
    if (info.stageIndex >= COIN_DROP_MIN_STAGE && this.rng() < chance.coin) this.board.spawnNear("coin_1", at);
    if (info.stageIndex >= ENERGY_DROP_MIN_STAGE && this.rng() < chance.energy) this.board.spawnNear("energy_1", at);
  }

  /** Tap a coin or energy item on the board to collect it. Returns what was collected, or null for other items. */
  collect(idx: number): { kind: "coin" | "energy"; amount: number } | null {
    const id = this.board.cells[idx];
    const reward = id ? rewardValue(id) : null;
    if (!reward) return null;
    this.board.remove(idx);
    if (reward.kind === "coin") this.coins += reward.amount;
    else this.energy.add(reward.amount, this.now());
    return reward;
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
    this.randomDelivered++;
    this.checkProgress();
    this.randomOrders = this.randomOrders.filter((o) => o.id !== orderId);
    this.refillRandomOrders();
    return { ok: true, stageCompleted: false };
  }

  /** What must happen before `productId` can be bought ("購買「X」" / "完成任務「Y」"), or null when nothing blocks it. */
  missingRequirement(productId: string): string | null {
    const p = getProduct(productId);
    if (p?.requires && !this.isPurchased(p.requires)) return `購買「${getProduct(p.requires)!.name}」`;
    if (p?.requiresTask && !this.doneTasks.includes(p.requiresTask)) return `完成任務「${getTask(p.requiresTask)!.name}」`;
    return null;
  }

  /** Spend coins on a shop product and apply its effect. */
  buy(productId: string): BuyResult {
    this.tick();
    const product = getProduct(productId);
    if (!product) return { ok: false, reason: "unknown-product" };
    const limit = purchaseLimit(product);
    if (this.purchaseCount(product.id) >= limit) return { ok: false, reason: "already-purchased" };
    if (this.missingRequirement(product.id)) return { ok: false, reason: "requires-other" };
    if (this.coins < product.cost) return { ok: false, reason: "no-coins" };
    this.coins -= product.cost;
    if (limit !== Infinity) this.purchased.push(product.id);
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
      warehouse: [...this.warehouse],
      unlockedRecipes: [...this.unlockedRecipes],
      made: { ...this.made },
      randomDelivered: this.randomDelivered,
      shards: this.shards,
      doneTasks: [...this.doneTasks],
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
      case "unlockRecipe":
        this.unlockRecipe(effect.recipe);
        break;
      case "openPrepSlot":
        this.notices.push(`🔓 料理台第 ${this.slotsOpen.prep} 格開放了`);
        break;
      case "unlockTheme":
        this.notices.push("🎨 已解鎖新主題");
        break;
    }
  }

  private unlockRecipe(resultId: string) {
    if (this.unlockedRecipes.includes(resultId)) return;
    this.unlockedRecipes.push(resultId);
    this.notices.push(`📖 解鎖食譜「${getItem(resultId)!.name}」`);
  }

  /** Complete tasks that reached their goal (giving their reward once), and assemble the shard recipe. */
  private checkProgress() {
    for (const t of tasks) {
      const p = taskProgress(t, this);
      if (p.have < p.need || this.doneTasks.includes(t.id)) continue;
      this.doneTasks.push(t.id);
      if (t.rewardRecipe) this.unlockRecipe(t.rewardRecipe);
      if (t.rewardPrepSlot) this.notices.push(`🔓 任務「${t.name}」完成，料理台第 ${this.slotsOpen.prep} 格開放了`);
    }
    if (this.shards >= SHARDS_NEEDED) this.unlockRecipe(SHARD_RECIPE);
  }

  private freeSlot(station: StationId): number | null {
    const i = this.stations[station].findIndex((c, slot) => c === null && slot < this.slotsOpen[station]);
    return i < 0 ? null : i;
  }

  /** Put a generator on its station, or in the warehouse when the station is full. */
  private stowGenerator(id: string) {
    const station = stationOf(id);
    const slot = this.freeSlot(station);
    if (slot !== null) this.stations[station][slot] = id;
    else {
      this.warehouse.push(id);
      this.notices.push(`📦 ${getItem(id)!.name}放進倉庫了`);
    }
  }

  private unlock(chainId: string) {
    if (this.unlocked.includes(chainId)) return;
    this.unlocked.push(chainId);
    this.stowGenerator(getAnyChain(chainId)!.generator.id);
  }

  private completeStage(stage: StoryStage) {
    this.coins += stage.reward;
    this.energy.add(stage.rewardEnergy, this.now());
    // Advance first so a slot opened by this stage can take the generators it unlocks.
    this.stageIndex++;
    for (const chainId of stage.unlocks) this.unlock(chainId);
    if (stage.opensPrepSlot) this.notices.push(`🔓 料理台第 ${this.slotsOpen.prep} 格開放了`);
    if (stage.rewardShard) {
      this.shards += stage.rewardShard;
      this.notices.push(`🧩 獲得食譜碎片（${Math.min(this.shards, SHARDS_NEEDED)}/${SHARDS_NEEDED}）`);
      this.checkProgress();
    }
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
      this.randomOrders.push(generateRandomOrder(this.nextOrderId++, this.rng, this.unlocked, this.stageIndex, this.unlockedRecipes));
    }
  }
}
