import shopData from "../data/shop.json";
import { getItem } from "./registry";
import type { StationId } from "./types";

/** Add new effect kinds here (and a case in Game.applyEffect) to sell other kinds of goods. */
export type ProductEffect =
  | { type: "energy"; amount: number }
  /** Permanently raises the energy cap. */
  | { type: "maxEnergy"; amount: number }
  /** Raises the energy cap for a while; buying again while active extends the time. */
  | { type: "maxEnergyBoost"; amount: number; durationMinutes: number }
  /** Unlocks a special recipe (by result item id). */
  | { type: "unlockRecipe"; recipe: string };

export interface Product {
  id: string;
  name: string;
  /** Price in coins. */
  cost: number;
  /** Can only be bought once per player. */
  once?: boolean;
  /** Id of a product that must be bought first. */
  requires?: string;
  effect: ProductEffect;
}

export const products = (shopData as { products: Product[] }).products;

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export const STATION_NAMES: Record<StationId, string> = { prep: "料理台", spice: "調味區" };

function formatDuration(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60} 小時` : `${minutes} 分鐘`;
}

export function describeEffect(effect: ProductEffect): string {
  switch (effect.type) {
    case "energy":
      return `⚡ +${effect.amount} 電力`;
    case "maxEnergy":
      return `🔋 電力上限 +${effect.amount}（永久）`;
    case "maxEnergyBoost":
      return `🔋 電力上限 +${effect.amount}，${formatDuration(effect.durationMinutes)}`;
    case "unlockRecipe":
      return `📖 解鎖食譜「${getItem(effect.recipe)?.name ?? effect.recipe}」`;
  }
}
