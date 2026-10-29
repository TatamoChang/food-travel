import { describe, expect, it } from "vitest";
import { chains, generatorOutput, getItem, mergeResult, stageLabels } from "../src/core/registry";

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
