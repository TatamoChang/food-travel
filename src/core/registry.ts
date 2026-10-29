import chainsData from "../data/chains.json";
import type { ChainDef, ChainsFile, ItemInfo } from "./types";

const data = chainsData as ChainsFile;

export const chains: readonly ChainDef[] = data.chains;
export const stageLabels: readonly string[] = data.stageLabels;

const items = new Map<string, ItemInfo>();

for (const chain of chains) {
  items.set(chain.generator.id, {
    id: chain.generator.id,
    name: chain.generator.name,
    chainId: chain.id,
    kind: "generator",
    stageIndex: -1,
  });
  chain.stages.forEach((stage, i) => {
    items.set(stage.id, {
      id: stage.id,
      name: stage.name,
      chainId: chain.id,
      kind: "stage",
      stageIndex: i,
    });
  });
}

export function getItem(id: string): ItemInfo | undefined {
  return items.get(id);
}

export function getChain(id: string): ChainDef | undefined {
  return chains.find((c) => c.id === id);
}

/** Result of merging two identical items, or null when they cannot merge (different, final stage, generator). */
export function mergeResult(a: string, b: string): string | null {
  if (a !== b) return null;
  const info = items.get(a);
  if (!info || info.kind !== "stage") return null;
  const chain = getChain(info.chainId);
  return chain?.stages[info.stageIndex + 1]?.id ?? null;
}

/** Item id spawned by tapping a generator. */
export function generatorOutput(generatorId: string): string | null {
  const info = items.get(generatorId);
  if (!info || info.kind !== "generator") return null;
  return getChain(info.chainId)?.stages[0].id ?? null;
}
