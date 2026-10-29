import storyData from "../data/story.json";
import { getChain, stageLabels } from "./registry";
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

/** Highest item stage index a random order may ask for at a given story stage. */
export function tierCap(storyStageIndex: number): number {
  return Math.min(stageLabels.length - 1, 1 + storyStageIndex);
}

/**
 * Random order from unlocked chains: 1-2 distinct items, each 1-2 copies.
 * Item stage is within [cap-1, cap] and cap grows with story progress.
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
  for (let i = 0; i < lines; i++) {
    const chain = chains[Math.floor(rng() * chains.length)];
    const stageIdx = lo + Math.floor(rng() * (cap - lo + 1));
    const count = 1 + Math.floor(rng() * 2);
    const itemId = chain.stages[stageIdx].id;
    const existing = requirements.find((r) => r.itemId === itemId);
    if (existing) existing.count += count;
    else requirements.push({ itemId, count });
    reward += 3 * 2 ** stageIdx * count;
  }
  return { id, requirements, reward };
}
