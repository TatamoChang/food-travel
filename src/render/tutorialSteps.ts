import type { Rect } from "./ui";

/** One page of the walkthrough; `target` (in 360x720 view space) is highlighted, or nothing when absent. */
export interface TutorialStep {
  /** Stable id; seen steps are remembered per device, so new steps added later still show once. */
  id: string;
  text: string;
  target?: Rect;
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: "welcome", text: "歡迎來到食光旅行！🍳\n跟著主廚環遊世界，合成料理、完成訂單。先花一分鐘認識畫面吧。" },
  { id: "generator", text: "這是產出器。點一下消耗 1 點電力，會在下面的空格產生食材。", target: { x: 12, y: 266, w: 56, h: 56 } },
  { id: "merge", text: "把兩個相同的物品拖在一起，就會合成成下一階：A → B → C → D → E。\n拖到空格是移動，拖到不同物品上是交換。", target: { x: 12, y: 322, w: 336, h: 168 } },
  { id: "hud", text: "左上角是電力和金幣。電力每 60 秒回 1 點，不夠時可以到商店買。", target: { x: 6, y: 2, w: 100, h: 36 } },
  { id: "story", text: "劇情訂單：湊齊所有料理後按「交付」，就能前往下一關。\n第 10、20、30 關是 Boss 關，過關可得食譜碎片。", target: { x: 12, y: 40, w: 336, h: 86 } },
  { id: "random", text: "隨機訂單：交付可以換金幣，交付後會補上新的訂單。", target: { x: 12, y: 134, w: 348, h: 120 } },
  { id: "stations", text: "最上排是料理台（左 5 格）和調味區（右 1 格），產出器放在這裡。\n過關、任務或商店可以開放更多格子，放不下的產出器會進倉庫。", target: { x: 12, y: 266, w: 336, h: 56 } },
  { id: "drops", text: "合成出較高階的料理，有機率在旁邊掉出金幣或電力，點一下就能領取。兩個同等級也可以先合成升等再領。", target: { x: 12, y: 322, w: 336, h: 392 } },
  { id: "special", text: "把調味料拖到對應的料理上，可以做成特製料理，訂單獎勵更高。配方都在「📖食譜」裡。" },
  { id: "buttons", text: "右上角：❓ 重看說明、🎨 換主題、📖 食譜、📦 倉庫、🛒 商店。", target: { x: 106, y: 4, w: 248, h: 32 } },
  { id: "done", text: "準備好了，出發吧！✈️\n先點幾下麵粉袋，把兩個麵團合成看看。" },
];

/** Steps not seen yet, in order. */
export function unseenSteps(seen: readonly string[]): TutorialStep[] {
  return TUTORIAL_STEPS.filter((s) => !seen.includes(s.id));
}

const KEY = "food_travel_tutorial_seen";

export function loadSeenSteps(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveSeenSteps(ids: readonly string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // Storage unavailable; the walkthrough will just show again next time.
  }
}
