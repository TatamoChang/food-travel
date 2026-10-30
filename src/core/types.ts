export interface StageDef {
  id: string;
  name: string;
}

export interface GeneratorDef {
  id: string;
  name: string;
  energyCost: number;
}

export interface ChainDef {
  id: string;
  /** Only dishes have a region. */
  region?: string;
  name: string;
  generator: GeneratorDef;
  /** Ordered lowest to highest. stages[i] + stages[i] merges into stages[i + 1]. */
  stages: StageDef[];
}

export interface ChainsFile {
  stageLabels: string[];
  /** Dishes, 5 stages (A..E) each; their generators sit on the prep station. */
  chains: ChainDef[];
  /** Seasonings, 3 grades each; their generators sit on the spice rack. */
  seasonings: ChainDef[];
}

/** daily: usable once its chains are unlocked. green/orange/red: special recipes that must be unlocked first. */
export type RecipeTier = "daily" | "green" | "orange" | "red";

export interface RecipeDef {
  tier: RecipeTier;
  /** Seasoning item id. */
  seasoning: string;
  /** Dish stage item id. */
  dish: string;
  /** The special dish made from them; it cannot merge further. */
  result: StageDef;
}

export interface RecipesFile {
  recipes: RecipeDef[];
}

/** Where a generator lives: prep station (dish generators) or spice rack (seasoning generators). */
export type StationId = "prep" | "spice";

/** Resolved lookup info for any item id. */
export interface ItemInfo {
  id: string;
  name: string;
  /** Dish or seasoning chain id; for special dishes, the dish chain they came from. */
  chainId: string;
  kind: "stage" | "generator" | "special";
  category: "dish" | "seasoning";
  /** 0-based stage index; -1 for generators; for special dishes, the stage of the dish they were made from. */
  stageIndex: number;
}
