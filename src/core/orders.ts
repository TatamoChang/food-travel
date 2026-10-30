import storyData from "../data/story.json";
import { getChain, getItem, recipeFor, recipes, stageLabels, type RecipeTier } from "./registry";
import type { Rng } from "./rng";

export interface Requirement {
  itemId: string;
  count: number;
}

export interface StoryStage {
  id: string;
  title: string;
  requirements: Requirement[];
  reward: number;
  rewardEnergy: number;
  /** Dish or seasoning chain ids unlocked on completion. */
  unlocks: string[];
  /** Boss stages are drawn in red. */
  boss?: boolean;
  /** Recipe shards granted on completion (see tasks.json shardRecipe). */
  rewardShard?: number;
  /** Completing the stage opens one more prep station slot. */
  opensPrepSlot?: boolean;
}

export interface StoryFile {
  initialUnlocked: string[];
  stages: StoryStage[];
}

export const story = storyData as StoryFile;

export interface RandomOrder {
  id: number;
  requirements: Requirement[];
  reward: number;
}

export const RANDOM_ORDER_SLOTS = 3;
/** Story stage index (0-based) from which random orders may ask for daily special dishes. */
export const SPECIAL_ORDER_FROM_STAGE = 2;
/** Chance that a random order line is a special dish, when one is available. */
export const SPECIAL_ORDER_CHANCE = 0.3;
/** Reward multiplier of a special dish over a plain dish of the same stage, by recipe tier. */
export const TIER_REWARD_MULT: Record<RecipeTier, number> = { daily: 1.5, green: 2, orange: 3, red: 5 };

/** Coins paid per copy of `itemId`. */
export function itemReward(itemId: string): number {
  const base = 3 * 2 ** getItem(itemId)!.stageIndex;
  const recipe = recipeFor(itemId);
  return recipe ? Math.round(base * TIER_REWARD_MULT[recipe.tier]) : base;
}

/**
 * Special dishes an order may ask for: both chains unlocked, dish stage within the cap, and the recipe
 * usable (daily ones from SPECIAL_ORDER_FROM_STAGE, special ones once unlocked).
 */
function availableSpecials(unlocked: readonly string[], storyStageIndex: number, cap: number, unlockedRecipes: readonly string[]): string[] {
  return recipes
    .filter((r) => {
      const dish = getItem(r.dish)!;
      const usable = r.tier === "daily" ? storyStageIndex >= SPECIAL_ORDER_FROM_STAGE : unlockedRecipes.includes(r.result.id);
      return usable && dish.stageIndex <= cap && unlocked.includes(dish.chainId) && unlocked.includes(getItem(r.seasoning)!.chainId);
    })
    .map((r) => r.result.id);
}

/** Highest item stage index a random order may ask for at a given story stage. */
export function tierCap(storyStageIndex: number): number {
  return Math.min(stageLabels.length - 1, 1 + storyStageIndex);
}

/**
 * Random order from unlocked chains: 1-2 distinct items, each 1-2 copies.
 * Item stage is within [cap-1, cap] and cap grows with story progress.
 * From SPECIAL_ORDER_FROM_STAGE on, a line may instead be a special dish, but only one whose
 * seasoning generator is already unlocked, so the order can always be made.
 */
export function generateRandomOrder(
  id: number,
  rng: Rng,
  unlockedChainIds: readonly string[],
  storyStageIndex: number,
  unlockedRecipes: readonly string[] = [],
): RandomOrder {
  const chains = unlockedChainIds.map((c) => getChain(c)).filter((c) => c !== undefined);
  const cap = tierCap(storyStageIndex);
  const lo = Math.max(0, cap - 1);
  const lines = 1 + Math.floor(rng() * 2);
  const requirements: Requirement[] = [];
  let reward = 0;
  const specials = availableSpecials(unlockedChainIds, storyStageIndex, cap, unlockedRecipes);
  for (let i = 0; i < lines; i++) {
    let itemId: string;
    if (specials.length > 0 && rng() < SPECIAL_ORDER_CHANCE) {
      itemId = specials[Math.floor(rng() * specials.length)];
    } else {
      const chain = chains[Math.floor(rng() * chains.length)];
      itemId = chain.stages[lo + Math.floor(rng() * (cap - lo + 1))].id;
    }
    const count = 1 + Math.floor(rng() * 2);
    const existing = requirements.find((r) => r.itemId === itemId);
    if (existing) existing.count += count;
    else requirements.push({ itemId, count });
    reward += itemReward(itemId) * count;
  }
  return { id, requirements, reward };
}
