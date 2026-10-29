import { describe, expect, it } from "vitest";
import { Board, COLS } from "../src/core/board";
import { Energy } from "../src/core/energy";
import { Game, newState } from "../src/core/game";
import { generateRandomOrder, story, tierCap } from "../src/core/orders";
import { chains, getItem } from "../src/core/registry";
import { mulberry32 } from "../src/core/rng";

describe("story data", () => {
  it("only references existing items from chains unlocked by then", () => {
    const unlocked = new Set(story.initialUnlocked);
    for (const stage of story.stages) {
      for (const r of stage.requirements) {
        const info = getItem(r.itemId);
        expect(info, r.itemId).toBeDefined();
        expect(unlocked.has(info!.chainId), `${stage.id} needs ${r.itemId}`).toBe(true);
      }
      for (const u of stage.unlocks) {
        expect(chains.some((c) => c.id === u)).toBe(true);
        unlocked.add(u);
      }
    }
  });
});

describe("Board", () => {
  it("moves, swaps and merges", () => {
    const b = new Board();
    b.cells[0] = "pizza_a";
    b.cells[1] = "pizza_a";
    b.cells[2] = "sushi_a";
    expect(b.move(0, 3).type).toBe("moved");
    expect(b.move(3, 1)).toEqual({ type: "merged", result: "pizza_b" });
    expect(b.cells[3]).toBeNull();
    expect(b.move(1, 2).type).toBe("swapped");
    expect(b.cells[1]).toBe("sushi_a");
    expect(b.move(5, 6).type).toBe("invalid");
  });

  it("spawns into the nearest empty cell and reports a full board", () => {
    const b = new Board();
    b.cells[0] = "gen_pizza";
    expect(b.spawnNear("pizza_a", 0)).toBe(1);
    expect(b.spawnNear("pizza_a", 0)).toBe(COLS); // cell below is as close as cell 1 was
    const full = new Board(new Array(48).fill("pizza_a"));
    expect(full.spawnNear("pizza_a", 0)).toBeNull();
    expect(Board.col(COLS)).toBe(0);
  });
});

describe("Energy", () => {
  it("spends, regenerates over time, and caps at max", () => {
    const e = new Energy({ value: 2, updatedAt: 0 }, 5, 1000);
    expect(e.spend(2, 0)).toBe(true);
    expect(e.spend(1, 0)).toBe(false);
    expect(e.msToNext(400)).toBe(600);
    e.sync(2500);
    expect(e.value).toBe(2);
    e.sync(100_000);
    expect(e.value).toBe(5);
  });
});

describe("Random orders", () => {
  it("come from unlocked chains with tier growing with the story", () => {
    const rng = mulberry32(1);
    for (let stage = 0; stage < 6; stage++) {
      const cap = tierCap(stage);
      for (let i = 0; i < 200; i++) {
        const o = generateRandomOrder(i, rng, ["pizza", "sushi"], stage);
        expect(o.requirements.length).toBeGreaterThanOrEqual(1);
        expect(o.requirements.length).toBeLessThanOrEqual(2);
        expect(new Set(o.requirements.map((r) => r.itemId)).size).toBe(o.requirements.length);
        for (const r of o.requirements) {
          const info = getItem(r.itemId)!;
          expect(["pizza", "sushi"]).toContain(info.chainId);
          expect(info.stageIndex).toBeLessThanOrEqual(cap);
          expect(info.stageIndex).toBeGreaterThanOrEqual(Math.max(0, cap - 1));
        }
      }
    }
    expect(tierCap(0)).toBe(1);
    expect(tierCap(10)).toBe(4);
  });
});

describe("Game", () => {
  const fixed = () => 0;

  it("taps a generator: spends energy, spawns A, handles empty energy", () => {
    const state = newState(0);
    state.energy.value = 1;
    const g = new Game(state, () => 0, mulberry32(1));
    expect(g.tap(0)).toEqual({ ok: true, spawnedAt: 1 });
    expect(g.board.cells[1]).toBe("pizza_a");
    expect(g.tap(0)).toEqual({ ok: false, reason: "no-energy" });
    expect(g.tap(1)).toEqual({ ok: false, reason: "not-generator" });
  });

  it("story delivery is all-or-nothing, then unlocks the next dish", () => {
    const state = newState(0);
    state.board[1] = "pizza_b";
    const g = new Game(state, fixed, mulberry32(1));

    expect(g.canDeliverStory()).toBe(false);
    expect(g.deliverStory()).toEqual({ ok: false });
    expect(g.board.cells[1]).toBe("pizza_b");

    g.board.cells[2] = "pizza_c";
    expect(g.canDeliverStory()).toBe(true);
    expect(g.deliverStory()).toEqual({ ok: true, stageCompleted: true });

    expect(g.board.cells).not.toContain("pizza_b");
    expect(g.board.cells).not.toContain("pizza_c");
    expect(g.stageIndex).toBe(1);
    expect(g.coins).toBe(story.stages[0].reward);
    expect(g.unlocked).toContain("sushi");
    expect(g.board.cells).toContain("gen_sushi");
  });

  it("delivering one order can make an overlapping order undeliverable", () => {
    const state = newState(0);
    state.randomOrders = [
      { id: 1, requirements: [{ itemId: "sushi_a", count: 2 }], reward: 10 },
      { id: 2, requirements: [{ itemId: "pizza_a", count: 1 }, { itemId: "sushi_a", count: 1 }], reward: 20 },
    ];
    state.nextOrderId = 3;
    state.board[1] = "pizza_a";
    state.board[2] = "sushi_a";
    state.board[3] = "sushi_a";
    const g = new Game(state, fixed, mulberry32(1));

    expect(g.canDeliverRandom(1)).toBe(true);
    expect(g.canDeliverRandom(2)).toBe(true);

    expect(g.deliverRandom(2).ok).toBe(true);
    expect(g.coins).toBe(20);
    expect(g.board.cells.filter((c) => c === "sushi_a")).toHaveLength(1);
    expect(g.board.cells).not.toContain("pizza_a");

    expect(g.canDeliverRandom(1)).toBe(false);
    expect(g.deliverRandom(1)).toEqual({ ok: false });
    expect(g.randomOrders).toHaveLength(3);
  });

  it("refills random orders after delivery", () => {
    const g = new Game(newState(0), fixed, mulberry32(7));
    const order = g.randomOrders[0];
    for (const r of order.requirements) {
      for (let i = 0; i < r.count; i++) g.board.cells[g.board.cells.indexOf(null)] = r.itemId;
    }
    expect(g.deliverRandom(order.id).ok).toBe(true);
    expect(g.randomOrders).toHaveLength(3);
    expect(g.randomOrders.some((o) => o.id === order.id)).toBe(false);
  });

  it("snapshot round-trips", () => {
    const g = new Game(undefined, () => 0, mulberry32(3));
    const snap = JSON.parse(JSON.stringify(g.snapshot()));
    const g2 = new Game(snap, () => 0, mulberry32(3));
    expect(g2.snapshot()).toEqual(g.snapshot());
  });

  it("completes the whole story", () => {
    const g = new Game(newState(0), fixed, mulberry32(1));
    for (const stage of story.stages) {
      for (const r of stage.requirements) {
        for (let i = 0; i < r.count; i++) {
          g.board.cells[g.board.cells.indexOf(null)] = r.itemId;
        }
      }
      expect(g.deliverStory().ok).toBe(true);
    }
    expect(g.storyCompleted).toBe(true);
    expect(g.currentStage).toBeNull();
  });
});
