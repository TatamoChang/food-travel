import tasksData from "../data/tasks.json";
import { getItem } from "./registry";

/** make: produce `count` of an item by merging. deliverRandom: deliver `count` random orders in total. */
export type TaskGoal = { type: "make"; itemId: string; count: number } | { type: "deliverRandom"; count: number };

export interface TaskDef {
  id: string;
  name: string;
  goal: TaskGoal;
  /** Special recipe (result item id) unlocked when the task is done. */
  rewardRecipe?: string;
  /** Completing the task opens one more prep station slot. */
  rewardPrepSlot?: boolean;
}

interface TasksFile {
  tasks: TaskDef[];
  /** Recipe assembled from boss-stage shards. */
  shardRecipe: string;
  shardsNeeded: number;
}

const data = tasksData as TasksFile;
export const tasks: readonly TaskDef[] = data.tasks;
export const SHARD_RECIPE = data.shardRecipe;
export const SHARDS_NEEDED = data.shardsNeeded;

/** Counters tasks are measured against. */
export interface TaskStats {
  /** Times each item id was produced by a merge. */
  made: Record<string, number>;
  randomDelivered: number;
}

/** Progress toward the goal, capped at the goal count. */
export function taskProgress(task: TaskDef, stats: TaskStats): { have: number; need: number } {
  const g = task.goal;
  const have = g.type === "make" ? (stats.made[g.itemId] ?? 0) : stats.randomDelivered;
  return { have: Math.min(have, g.count), need: g.count };
}

export function getTask(id: string): TaskDef | undefined {
  return tasks.find((t) => t.id === id);
}

/** "製作豪華壽司船 2/5" style progress text. */
export function describeTask(task: TaskDef, stats: TaskStats): string {
  const p = taskProgress(task, stats);
  const what = task.goal.type === "make" ? `製作${getItem(task.goal.itemId)!.name}` : "交付隨機訂單";
  return `任務「${task.name}」：${what} ${p.have}/${p.need}`;
}

/** Task that unlocks a recipe, if any. */
export function taskForRecipe(resultId: string): TaskDef | undefined {
  return tasks.find((t) => t.rewardRecipe === resultId);
}
