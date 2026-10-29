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
  region: string;
  name: string;
  generator: GeneratorDef;
  /** Ordered A..E. stages[i] + stages[i] merges into stages[i + 1]. */
  stages: StageDef[];
}

export interface ChainsFile {
  stageLabels: string[];
  chains: ChainDef[];
}

/** Resolved lookup info for any item id (stage item or generator). */
export interface ItemInfo {
  id: string;
  name: string;
  chainId: string;
  kind: "stage" | "generator";
  /** 0-based stage index; -1 for generators. */
  stageIndex: number;
}
