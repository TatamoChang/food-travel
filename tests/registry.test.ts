import { describe, expect, it } from "vitest";
import { chains, generatorOutput, getItem, itemLabel, mergeResult, recipes, seasonings, stageLabels, stationOf } from "../src/core/registry";

describe("chain data", () => {
  it("has 3 dishes, each with 5 stages", () => {
    expect(chains).toHaveLength(3);
    for (const c of chains) expect(c.stages).toHaveLength(stageLabels.length);
  });

  it("has globally unique item ids", () => {
    const ids = chains.flatMap((c) => [c.generator.id, ...c.stages.map((s) => s.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("merge rules", () => {
  it("merges X+X into next stage up to E", () => {
    for (const c of chains) {
      for (let i = 0; i < 4; i++) {
        expect(mergeResult(c.stages[i].id, c.stages[i].id)).toBe(c.stages[i + 1].id);
      }
    }
  });

  it("does not merge final stage, mismatched items, or generators", () => {
    const [pizza, sushi] = chains;
    expect(mergeResult(pizza.stages[4].id, pizza.stages[4].id)).toBeNull();
    expect(mergeResult(pizza.stages[0].id, sushi.stages[0].id)).toBeNull();
    expect(mergeResult(pizza.stages[0].id, pizza.stages[1].id)).toBeNull();
    expect(mergeResult(pizza.generator.id, pizza.generator.id)).toBeNull();
  });

  it("generator spawns stage A", () => {
    for (const c of chains) {
      expect(generatorOutput(c.generator.id)).toBe(c.stages[0].id);
      expect(getItem(c.generator.id)?.kind).toBe("generator");
    }
  });
});

describe("seasonings and recipes", () => {
  it("has 2 seasonings with 3 grades, and unique ids across everything", () => {
    expect(seasonings).toHaveLength(2);
    for (const s of seasonings) expect(s.stages).toHaveLength(3);
    const ids = [...chains, ...seasonings].flatMap((c) => [c.generator.id, ...c.stages.map((s) => s.id)]);
    ids.push(...recipes.map((r) => r.result.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("seasonings merge up to grade 3 and their generators spawn grade 1 on the spice rack", () => {
    for (const s of seasonings) {
      expect(mergeResult(s.stages[0].id, s.stages[0].id)).toBe(s.stages[1].id);
      expect(mergeResult(s.stages[1].id, s.stages[1].id)).toBe(s.stages[2].id);
      expect(mergeResult(s.stages[2].id, s.stages[2].id)).toBeNull();
      expect(generatorOutput(s.generator.id)).toBe(s.stages[0].id);
      expect(stationOf(s.generator.id)).toBe("spice");
      expect(itemLabel(s.stages[1].id)).toBe("2等");
    }
    expect(stationOf("gen_sushi")).toBe("prep");
  });

  it("recipes combine a seasoning and a dish in either order into a final special dish", () => {
    expect(recipes).toHaveLength(6);
    for (const r of recipes) {
      expect(getItem(r.seasoning)?.category).toBe("seasoning");
      expect(getItem(r.dish)?.category).toBe("dish");
      expect(mergeResult(r.seasoning, r.dish)).toBe(r.result.id);
      expect(mergeResult(r.dish, r.seasoning)).toBe(r.result.id);
      const info = getItem(r.result.id)!;
      expect(info.kind).toBe("special");
      expect(info.stageIndex).toBe(getItem(r.dish)!.stageIndex);
      expect(itemLabel(r.result.id)).toBe("特");
      expect(mergeResult(r.result.id, r.result.id)).toBeNull();
      expect(mergeResult(r.result.id, r.seasoning)).toBeNull();
    }
    expect(mergeResult("spice_2", "pizza_d")).toBeNull();
    expect(mergeResult("salt_2", "sushi_c")).toBe("special_sushi_salted");
  });
});
