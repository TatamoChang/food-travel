import { describe, expect, it } from "vitest";
import { Board, COLS, ROWS } from "../src/core/board";
import { Energy } from "../src/core/energy";
import { Game, newState, type SavedState } from "../src/core/game";
import { SPECIAL_ORDER_FROM_STAGE, generateRandomOrder, story, tierCap } from "../src/core/orders";
import { getAnyChain, getItem, recipeFor, recipes } from "../src/core/registry";
import { mulberry32 } from "../src/core/rng";
import { getProduct, products } from "../src/core/shop";

describe("story data", () => {
  it("every stage rewards coins and energy", () => {
    for (const stage of story.stages) {
      expect(stage.reward).toBeGreaterThan(0);
      expect(stage.rewardEnergy).toBeGreaterThan(0);
    }
  });

  it("only references existing items from chains unlocked by then", () => {
    const unlocked = new Set(story.initialUnlocked);
    for (const stage of story.stages) {
      for (const r of stage.requirements) {
        const info = getItem(r.itemId);
        expect(info, r.itemId).toBeDefined();
        expect(unlocked.has(info!.chainId), `${stage.id} needs ${r.itemId}`).toBe(true);
      }
      for (const u of stage.unlocks) {
        expect(getAnyChain(u), u).toBeDefined();
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
    b.cells[0] = "pizza_b";
    expect(b.spawnNear("pizza_a", 0)).toBe(1);
    expect(b.spawnNear("pizza_a", 0)).toBe(COLS); // cell below is as close as cell 1 was
    const full = new Board(new Array(COLS * ROWS).fill("pizza_a"));
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

describe("Energy.add", () => {
  it("can exceed max, and regen only resumes once below max", () => {
    const e = new Energy({ value: 5, updatedAt: 0 }, 5, 1000);
    e.add(10, 0);
    expect(e.value).toBe(15);
    expect(e.spend(11, 50_000)).toBe(true);
    expect(e.value).toBe(4);
    expect(e.msToNext(50_500)).toBe(500);
    e.sync(51_000);
    expect(e.value).toBe(5);
  });
});

describe("Shop", () => {
  const rich = (coins: number, energy = 3) => {
    const state = newState(0);
    state.coins = coins;
    state.energy.value = energy;
    return new Game(state, () => 0, mulberry32(1));
  };

  it("has valid, unique products", () => {
    expect(new Set(products.map((p) => p.id)).size).toBe(products.length);
    for (const p of products) {
      expect(p.cost).toBeGreaterThan(0);
      if ("amount" in p.effect) expect(p.effect.amount).toBeGreaterThan(0);
      if (p.requires) expect(getProduct(p.requires), p.id).toBeDefined();
    }
  });

  it("buying energy spends coins and grants energy", () => {
    const p = products[0];
    const g = rich(p.cost + 7);
    expect(g.buy(p.id)).toEqual({ ok: true });
    expect(g.coins).toBe(7);
    expect(g.energy.value).toBe(3 + (p.effect.type === "energy" ? p.effect.amount : NaN));
  });

  it("rejects purchases without enough coins or with unknown ids", () => {
    const p = products[0];
    const g = rich(p.cost - 1);
    expect(g.buy(p.id)).toEqual({ ok: false, reason: "no-coins" });
    expect(g.buy("nope")).toEqual({ ok: false, reason: "unknown-product" });
    expect(g.coins).toBe(p.cost - 1);
    expect(g.energy.value).toBe(3);
  });
});

describe("Shop energy cap", () => {
  const MIN = 60_000;
  const setup = (coins = 5000) => {
    let t = 0;
    const state = newState(0);
    state.coins = coins;
    const g = new Game(state, () => t, mulberry32(1));
    return { g, advance: (ms: number) => (t += ms), clock: () => t };
  };

  it("permanent cap upgrades can only be bought once", () => {
    const { g } = setup();
    const p = getProduct("cap_plus_5")!;
    expect(g.energy.max).toBe(20);
    expect(g.buy(p.id)).toEqual({ ok: true });
    expect(g.energy.max).toBe(25);
    expect(g.energy.value).toBe(20);
    const coins = g.coins;
    expect(g.buy(p.id)).toEqual({ ok: false, reason: "already-purchased" });
    expect(g.coins).toBe(coins);
    expect(g.isPurchased(p.id)).toBe(true);

    expect(g.buy("cap_plus_10").ok).toBe(true);
    expect(g.energy.max).toBe(35);
  });

  it("a higher cap lets energy regenerate up to it without an instant payout", () => {
    const { g, advance } = setup();
    advance(10 * 60 * MIN); // sit at full energy for a long time
    g.buy("cap_plus_5");
    expect(g.energy.value).toBe(20);
    advance(MIN);
    g.energy.sync(advance(0));
    expect(g.energy.value).toBe(21);
  });

  it("temporary boost raises the cap, expires, and extends when re-bought", () => {
    const { g, advance, clock } = setup();
    g.buy("cap_boost_30m");
    expect(g.energy.max).toBe(30);
    expect(g.boostExpiresAt("cap_boost_30m")).toBe(30 * MIN);

    advance(10 * MIN);
    g.buy("cap_boost_30m");
    expect(g.boostExpiresAt("cap_boost_30m")).toBe(60 * MIN);
    expect(g.energy.max).toBe(30);

    g.buy("cap_boost_2h");
    expect(g.energy.max).toBe(50);

    advance(51 * MIN); // 61 min in: 30m boost gone, 2h boost still on
    g.tick();
    expect(g.boostExpiresAt("cap_boost_30m")).toBeNull();
    expect(g.energy.max).toBe(40);

    advance(120 * MIN);
    g.tick();
    expect(g.energy.max).toBe(20);
    expect(clock()).toBe(181 * MIN);
  });

  it("keeps energy above the cap after a boost ends, without regen", () => {
    const { g, advance } = setup();
    g.buy("cap_boost_30m");
    g.buy("energy_large");
    expect(g.energy.value).toBe(100);
    advance(31 * MIN);
    g.tick();
    expect(g.energy.max).toBe(20);
    expect(g.energy.value).toBe(100);
  });

  it("persists upgrades and active boosts through a save", () => {
    const { g } = setup();
    g.buy("cap_plus_5");
    g.buy("cap_boost_30m");
    const snap = JSON.parse(JSON.stringify(g.snapshot()));
    const g2 = new Game(snap, () => 5 * MIN, mulberry32(1));
    expect(g2.energy.max).toBe(35);
    expect(g2.isPurchased("cap_plus_5")).toBe(true);
    expect(g2.boostExpiresAt("cap_boost_30m")).toBe(30 * MIN);
    const g3 = new Game(snap, () => 31 * MIN, mulberry32(1));
    expect(g3.energy.max).toBe(25);
  });

  it("loads old saves that lack the new fields", () => {
    const old: Partial<ReturnType<Game["snapshot"]>> = newState(0);
    delete old.maxEnergyBonus;
    delete old.purchased;
    delete old.boosts;
    const g = new Game(old as ReturnType<Game["snapshot"]>, () => 0, mulberry32(1));
    expect(g.energy.max).toBe(20);
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

  it("taps a station generator: spends energy, spawns A on the board, handles empty energy", () => {
    const state = newState(0);
    state.energy.value = 1;
    const g = new Game(state, () => 0, mulberry32(1));
    expect(g.stations.prep[0]).toBe("gen_pizza");
    expect(g.tapStation("prep", 0)).toEqual({ ok: true, spawnedAt: 0 });
    expect(g.board.cells[0]).toBe("pizza_a");
    expect(g.tapStation("prep", 0)).toEqual({ ok: false, reason: "no-energy" });
    expect(g.tapStation("prep", 1)).toEqual({ ok: false, reason: "not-generator" });
    expect(g.tapStation("spice", 0)).toEqual({ ok: false, reason: "not-generator" });
  });

  it("reports a full board before spending energy", () => {
    const state = newState(0);
    state.board = new Array(COLS * ROWS).fill("pizza_e");
    const g = new Game(state, () => 0, mulberry32(1));
    expect(g.tapStation("prep", 0)).toEqual({ ok: false, reason: "board-full" });
    expect(g.energy.value).toBe(20);
  });

  it("story delivery is all-or-nothing, then unlocks the next dish", () => {
    const state = newState(0);
    state.board[1] = "pizza_b";
    state.slotsOpen.prep = 2;
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
    expect(g.energy.value).toBe(20 + story.stages[0].rewardEnergy);
    expect(g.unlocked).toContain("sushi");
    expect(g.stations.prep).toEqual(["gen_pizza", "gen_sushi", null]);
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

describe("Stations and warehouse", () => {
  const game = (edit?: (s: ReturnType<typeof newState>) => void) => {
    const s = newState(0);
    edit?.(s);
    return new Game(s, () => 0, mulberry32(1));
  };

  it("unlocked generators go to their station, or the warehouse when it is full", () => {
    const g = game();
    g.board.cells[0] = "pizza_b";
    g.board.cells[1] = "pizza_c";
    g.deliverStory(); // unlocks sushi, but the prep station has 1 open slot
    expect(g.stations.prep).toEqual(["gen_pizza", null, null]);
    expect(g.warehouse).toEqual(["gen_sushi"]);
    g.board.cells[0] = "pizza_d";
    g.board.cells[1] = "sushi_c";
    g.deliverStory(); // unlocks croissant and salt
    expect(g.warehouse).toEqual(["gen_sushi", "gen_croissant"]);
    expect(g.stations.spice).toEqual(["gen_salt", null, null]);
  });

  it("stores and places generators to swap what is on a station", () => {
    const g = game((s) => (s.warehouse = ["gen_sushi"]));
    expect(g.canPlace(0)).toBe(false); // only slot is taken
    expect(g.storeFromStation("prep", 0)).toBe(true);
    expect(g.stations.prep[0]).toBeNull();
    expect(g.warehouse).toEqual(["gen_sushi", "gen_pizza"]);
    expect(g.storeFromStation("prep", 0)).toBe(false);
    expect(g.placeFromWarehouse(0)).toBe(true);
    expect(g.stations.prep[0]).toBe("gen_sushi");
    expect(g.warehouse).toEqual(["gen_pizza"]);
    expect(g.tapStation("prep", 0)).toEqual({ ok: true, spawnedAt: 0 });
    expect(g.board.cells[0]).toBe("sushi_a");
  });

  it("puts generators on their own station and items on the board", () => {
    const g = game((s) => (s.warehouse = ["gen_spice", "sushi_b"]));
    expect(g.placeFromWarehouse(0)).toBe(true);
    expect(g.stations.spice[0]).toBe("gen_spice");
    expect(g.placeFromWarehouse(0)).toBe(true);
    expect(g.board.cells[0]).toBe("sushi_b");
    expect(g.warehouse).toEqual([]);
    expect(g.placeFromWarehouse(0)).toBe(false);
  });

  it("does not place items when the board is full", () => {
    const g = game((s) => {
      s.board = new Array(COLS * ROWS).fill("pizza_e");
      s.warehouse = ["sushi_b"];
    });
    expect(g.canPlace(0)).toBe(false);
    expect(g.placeFromWarehouse(0)).toBe(false);
  });

  it("spice rack generators spawn near their column", () => {
    const g = game((s) => (s.stations.spice[0] = "gen_salt"));
    expect(g.tapStation("spice", 0)).toEqual({ ok: true, spawnedAt: 3 });
    expect(g.board.cells[3]).toBe("salt_1");
  });

  it("round-trips stations, slots and warehouse through a save", () => {
    const g = game((s) => {
      s.warehouse = ["gen_sushi"];
      s.slotsOpen.spice = 2;
    });
    const g2 = new Game(JSON.parse(JSON.stringify(g.snapshot())), () => 0, mulberry32(1));
    expect(g2.snapshot()).toEqual(g.snapshot());
  });
});

describe("Slot expansion products", () => {
  const rich = () => {
    const s = newState(0);
    s.coins = 5000;
    return new Game(s, () => 0, mulberry32(1));
  };

  it("third slot needs the second one first", () => {
    const g = rich();
    expect(g.missingRequirement("prep_slot_3")).toBe("prep_slot_2");
    expect(g.buy("prep_slot_3")).toEqual({ ok: false, reason: "requires-other" });
    expect(g.coins).toBe(5000);
    expect(g.buy("prep_slot_2")).toEqual({ ok: true });
    expect(g.slotsOpen.prep).toBe(2);
    expect(g.missingRequirement("prep_slot_3")).toBeNull();
    expect(g.buy("prep_slot_3")).toEqual({ ok: true });
    expect(g.slotsOpen.prep).toBe(3);
    expect(g.buy("prep_slot_3")).toEqual({ ok: false, reason: "already-purchased" });
    expect(g.coins).toBe(5000 - 200 - 600);
  });

  it("each station expands separately", () => {
    const g = rich();
    g.buy("spice_slot_2");
    g.buy("spice_slot_3");
    expect(g.slotsOpen).toEqual({ prep: 1, spice: 3 });
  });

  it("an opened slot can take a warehouse generator", () => {
    const g = rich();
    g.warehouse.push("gen_sushi");
    expect(g.canPlace(0)).toBe(false);
    g.buy("prep_slot_2");
    expect(g.placeFromWarehouse(0)).toBe(true);
    expect(g.stations.prep).toEqual(["gen_pizza", "gen_sushi", null]);
  });
});

describe("v1 save migration", () => {
  /** v1 save: 6x8 board with generators on it, pendingGenerators, no station fields. */
  const legacy = (cells: Record<number, string>, extra: Partial<SavedState> = {}): SavedState => {
    const board = new Array(COLS * (ROWS + 1)).fill(null);
    for (const [i, id] of Object.entries(cells)) board[Number(i)] = id;
    return {
      board,
      energy: { value: 20, updatedAt: 0 },
      coins: 10,
      stageIndex: 1,
      unlocked: ["pizza", "sushi"],
      randomOrders: [],
      nextOrderId: 1,
      pendingGenerators: [],
      ...extra,
    };
  };

  it("moves generators to the stations and the top row's items onto the board", () => {
    const g = new Game(legacy({ 0: "gen_pizza", 1: "pizza_b", 5: "sushi_a", 7: "pizza_c", 20: "gen_sushi" }), () => 0, mulberry32(1));
    expect(g.board.cells).toHaveLength(COLS * ROWS);
    expect(g.stations.prep).toEqual(["gen_pizza", null, null]);
    expect(g.warehouse).toEqual(["gen_sushi"]);
    expect(g.board.cells).not.toContain("gen_pizza");
    expect(g.board.cells).not.toContain("gen_sushi");
    // old cell 7 (row 1, col 1) is now cell 1
    expect(g.board.cells[1]).toBe("pizza_c");
    expect(g.board.count("pizza_b")).toBe(1);
    expect(g.board.count("sushi_a")).toBe(1);
    expect(g.slotsOpen).toEqual({ prep: 1, spice: 1 });
  });

  it("parks top-row items in the warehouse when the board is full", () => {
    const cells: Record<number, string> = { 0: "gen_pizza", 1: "pizza_b", 2: "sushi_d" };
    for (let i = COLS; i < COLS * (ROWS + 1); i++) cells[i] = "pizza_e";
    const g = new Game(legacy(cells), () => 0, mulberry32(1));
    expect(g.board.cells.every((c) => c === "pizza_e")).toBe(true);
    expect(g.warehouse).toEqual(["pizza_b", "sushi_d"]);
  });

  it("generators leaving the board free cells for the top row's items", () => {
    const cells: Record<number, string> = { 0: "pizza_b", 40: "gen_pizza" };
    for (let i = COLS; i < COLS * (ROWS + 1); i++) if (i !== 40) cells[i] = "pizza_e";
    const g = new Game(legacy(cells), () => 0, mulberry32(1));
    expect(g.stations.prep[0]).toBe("gen_pizza");
    expect(g.board.cells[40 - COLS]).toBe("pizza_b");
    expect(g.warehouse).toEqual([]);
  });

  it("pending generators and seasonings of finished stages are granted", () => {
    const g = new Game(
      legacy({ 0: "gen_pizza" }, { stageIndex: 3, unlocked: ["pizza", "sushi", "croissant"], pendingGenerators: ["gen_croissant"] }),
      () => 0,
      mulberry32(1),
    );
    expect(g.unlocked).toEqual(expect.arrayContaining(["salt", "spice"]));
    expect(g.stations.spice).toEqual(["gen_salt", null, null]);
    expect(g.warehouse).toEqual(["gen_croissant", "gen_spice"]);
  });
});

describe("Special dishes in random orders", () => {
  it("only appear from the configured stage, and only with their seasoning unlocked", () => {
    const rng = mulberry32(5);
    const all = ["pizza", "sushi", "croissant", "salt", "spice"];
    const specialsIn = (unlocked: string[], stage: number) => {
      const seen = new Set<string>();
      for (let i = 0; i < 500; i++) {
        for (const r of generateRandomOrder(i, rng, unlocked, stage).requirements) {
          if (getItem(r.itemId)!.kind === "special") seen.add(r.itemId);
        }
      }
      return seen;
    };
    expect(specialsIn(all, SPECIAL_ORDER_FROM_STAGE - 1).size).toBe(0);
    expect(specialsIn(all, 4).size).toBe(recipes.length);
    const saltOnly = specialsIn(["pizza", "sushi", "croissant", "salt"], SPECIAL_ORDER_FROM_STAGE);
    expect(saltOnly.size).toBeGreaterThan(0);
    for (const id of saltOnly) expect(recipeFor(id)!.seasoning.startsWith("salt")).toBe(true);
    // stage 3 (index 2) caps at D, so no special made from an E dish could show up anyway
    for (const id of specialsIn(all, SPECIAL_ORDER_FROM_STAGE)) expect(getItem(id)!.stageIndex).toBeLessThanOrEqual(tierCap(SPECIAL_ORDER_FROM_STAGE));
  });

  it("pay about 1.5x a plain dish of the same stage", () => {
    const rng = mulberry32(9);
    for (let i = 0; i < 300; i++) {
      const o = generateRandomOrder(i, rng, ["pizza", "sushi", "croissant", "salt", "spice"], 4);
      const expected = o.requirements.reduce((n, r) => {
        const info = getItem(r.itemId)!;
        const base = 3 * 2 ** info.stageIndex;
        return n + (info.kind === "special" ? Math.round(base * 1.5) : base) * r.count;
      }, 0);
      expect(o.reward).toBe(expected);
    }
  });
});
