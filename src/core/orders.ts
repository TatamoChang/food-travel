import storyData from "../data/story.json";
import { getChain, getItem, recipes, stageLabels } from "./registry";
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
  unlocks: string[];
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
/** Story stage index (0-based) from which random orders may ask for special dishes. */
export const SPECIAL_ORDER_FROM_STAGE = 2;
/** Chance that a random order line is a special dish, when one is available. */
export const SPECIAL_ORDER_CHANCE = 0.3;
/** Reward multiplier of a special dish over a plain dish of the same stage. */
export const SPECIAL_REWARD_MULT = 1.5;

/** Coins paid per copy of an item at `stageIdx`. */
function itemReward(stageIdx: number, special: boolean): number {
  const base = 3 * 2 ** stageIdx;
  return special ? Math.round(base * SPECIAL_REWARD_MULT) : base;
}

/** Special dishes whose dish and seasoning chains are both unlocked and whose stage is within the cap. */
function availableSpecials(unlocked: readonly string[], storyStageIndex: number, cap: number): string[] {
  if (storyStageIndex < SPECIAL_ORDER_FROM_STAGE) return [];
  return recipes
    .filter((r) => {
      const dish = getItem(r.dish)!;
      return dish.stageIndex <= cap && unlocked.includes(dish.chainId) && unlocked.includes(getItem(r.seasoning)!.chainId);
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
): RandomOrder {
  const chains = unlockedChainIds.map((c) => getChain(c)).filter((c) => c !== undefined);
  const cap = tierCap(storyStageIndex);
  const lo = Math.max(0, cap - 1);
  const lines = 1 + Math.floor(rng() * 2);
  const requirements: Requirement[] = [];
  let reward = 0;
  const specials = availableSpecials(unlockedChainIds, storyStageIndex, cap);
  for (let i = 0; i < lines; i++) {
    let itemId: string;
    let stageIdx: number;
    const special = specials.length > 0 && rng() < SPECIAL_ORDER_CHANCE;
    if (special) {
      itemId = specials[Math.floor(rng() * specials.length)];
      stageIdx = getItem(itemId)!.stageIndex;
    } else {
      const chain = chains[Math.floor(rng() * chains.length)];
      stageIdx = lo + Math.floor(rng() * (cap - lo + 1));
      itemId = chain.stages[stageIdx].id;
    }
    const count = 1 + Math.floor(rng() * 2);
    const existing = requirements.find((r) => r.itemId === itemId);
    if (existing) existing.count += count;
    else requirements.push({ itemId, count });
    reward += itemReward(stageIdx, special) * count;
  }
  return { id, requirements, reward };
}
