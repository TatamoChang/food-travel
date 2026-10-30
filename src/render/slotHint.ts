import type { Game } from "../core/game";
import { describeTask } from "../core/tasks";

/** How a locked prep slot opens: a two-line label for the slot itself, and a sentence with progress. */
export function prepSlotHint(game: Game, slot: number): { short: string; long: string } {
  const src = game.lockedSlotSource(slot);
  if (!src) return { short: "🔒", long: "🔒 尚未開放" };
  if (src.kind === "stage") return { short: `🔒\n第${src.stage}關`, long: `🔒 通過第 ${src.stage} 關開放` };
  if (src.kind === "task") return { short: "🔒\n任務", long: `🔒 ${describeTask(src.task, game)}` };
  return { short: "🔒\n商店", long: `🔒 商店購買「${src.product.name}」🪙${src.product.cost}` };
}
