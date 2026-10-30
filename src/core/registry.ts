import chainsData from "../data/chains.json";
import recipesData from "../data/recipes.json";
import type { ChainDef, ChainsFile, ItemInfo, RecipeDef, RecipesFile, StationId } from "./types";

const data = chainsData as ChainsFile;

export const chains: readonly ChainDef[] = data.chains;
export const seasonings: readonly ChainDef[] = data.seasonings;
export const stageLabels: readonly string[] = data.stageLabels;
export const recipes: readonly RecipeDef[] = (recipesData as RecipesFile).recipes;

const items = new Map<string, ItemInfo>();

function register(chain: ChainDef, category: ItemInfo["category"]) {
  items.set(chain.generator.id, {
    id: chain.generator.id,
    name: chain.generator.name,
    chainId: chain.id,
    kind: "generator",
    category,
    stageIndex: -1,
  });
  chain.stages.forEach((stage, i) => {
    items.set(stage.id, { id: stage.id, name: stage.name, chainId: chain.id, kind: "stage", category, stageIndex: i });
  });
}

for (const chain of chains) register(chain, "dish");
for (const chain of seasonings) register(chain, "seasoning");
for (const r of recipes) {
  const dish = items.get(r.dish)!;
  items.set(r.result.id, {
    id: r.result.id,
    name: r.result.name,
    chainId: dish.chainId,
    kind: "special",
    category: "dish",
    stageIndex: dish.stageIndex,
  });
}

export function getItem(id: string): ItemInfo | undefined {
  return items.get(id);
}

/** Dish chain by id. */
export function getChain(id: string): ChainDef | undefined {
  return chains.find((c) => c.id === id);
}

/** Dish or seasoning chain by id. */
export function getAnyChain(id: string): ChainDef | undefined {
  return getChain(id) ?? seasonings.find((c) => c.id === id);
}

/** Recipe producing the special dish `id`, if it is one. */
export function recipeFor(id: string): RecipeDef | undefined {
  return recipes.find((r) => r.result.id === id);
}

/** Short tier label: A..E for dishes, 1等..3等 for seasonings, 特 for special dishes, 產 for generators. */
export function itemLabel(id: string): string {
  const info = items.get(id);
  if (!info) return "?";
  if (info.kind === "generator") return "產";
  if (info.kind === "special") return "特";
  return info.category === "seasoning" ? `${info.stageIndex + 1}等` : stageLabels[info.stageIndex];
}

/** Station a generator belongs on. */
export function stationOf(generatorId: string): StationId {
  return items.get(generatorId)?.category === "seasoning" ? "spice" : "prep";
}

/**
 * Result of dropping one item on another, or null when they cannot merge.
 * Two identical stage items step up their chain (the top stage cannot); a seasoning and a dish
 * matching a recipe make a special dish, in either order. Generators and special dishes never merge.
 */
export function mergeResult(a: string, b: string): string | null {
  const recipe = recipes.find((r) => (r.seasoning === a && r.dish === b) || (r.seasoning === b && r.dish === a));
  if (recipe) return recipe.result.id;
  if (a !== b) return null;
  const info = items.get(a);
  if (!info || info.kind !== "stage") return null;
  return getAnyChain(info.chainId)?.stages[info.stageIndex + 1]?.id ?? null;
}

/** Item id spawned by tapping a generator. */
export function generatorOutput(generatorId: string): string | null {
  const info = items.get(generatorId);
  if (!info || info.kind !== "generator") return null;
  return getAnyChain(info.chainId)?.stages[0].id ?? null;
}
