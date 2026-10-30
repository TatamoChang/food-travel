import { Graphics, type Container } from "pixi.js";
import type { Game } from "../core/game";
import { TIER_REWARD_MULT } from "../core/orders";
import { chains, getItem, recipes, seasonings, type RecipeTier } from "../core/registry";
import { products } from "../core/shop";
import { SHARDS_NEEDED, SHARD_RECIPE, taskForRecipe, taskProgress } from "../core/tasks";
import type { RecipeDef } from "../core/types";
import { PANEL_W, PANEL_X, ScrollPanel } from "./Panel";
import { iconSprite } from "./icons";
import { makeText } from "./ui";

const CHAIN_ROW_H = 58;
const RECIPE_ROW_H = 66;
const TAB_H = 44;
const SPECIAL_TIERS: { tier: RecipeTier; label: string; color: number }[] = [
  { tier: "green", label: "🟢 綠色食譜", color: 0x4caf50 },
  { tier: "orange", label: "🟠 橘色食譜", color: 0xf08a24 },
  { tier: "red", label: "🔴 紅色食譜", color: 0xe0483a },
];

/** Recipe book: daily recipes (merge chains and seasoning recipes unlocked by the story) and special recipes by tier. */
export class RecipeView extends ScrollPanel {
  private tab: "daily" | "special" = "daily";

  constructor(private readonly game: Game) {
    super("食譜");
  }

  open() {
    this.render();
  }

  private render() {
    const g = this.game;
    const specials = recipes.filter((r) => r.tier !== "daily");
    const known = specials.filter((r) => g.isRecipeUnlocked(r.result.id)).length;
    this.build(`特別食譜 ${known}/${specials.length}`, (list) => {
      const tabW = (PANEL_W - 32) / 2;
      this.button(list, { x: PANEL_X + 12, y: 0, w: tabW, h: 32 }, this.tab === "daily" ? "▶ 日常食譜" : "日常食譜", true, () => this.switchTab("daily"));
      this.button(list, { x: PANEL_X + 20 + tabW, y: 0, w: tabW, h: 32 }, this.tab === "special" ? "▶ 特別食譜" : "特別食譜", true, () => this.switchTab("special"));
      return TAB_H + (this.tab === "daily" ? this.drawDaily(list, TAB_H) : this.drawSpecial(list, TAB_H));
    });
  }

  private switchTab(tab: "daily" | "special") {
    this.tab = tab;
    this.render();
  }

  private section(list: Container, y: number, label: string, color = 0x9fc3e8) {
    list.addChild(makeText(label, PANEL_X + 16, y + 4, 14, color));
    return 26;
  }

  /** Merge chains of unlocked dishes and seasonings, then daily seasoning recipes whose chains are unlocked. */
  private drawDaily(list: Container, top: number): number {
    const g = this.game;
    let y = top;
    y += this.section(list, y, "合成路線");
    for (const chain of [...chains, ...seasonings]) {
      if (!g.unlocked.includes(chain.id)) continue;
      list.addChild(new Graphics().roundRect(PANEL_X + 12, y, PANEL_W - 24, CHAIN_ROW_H - 6, 8).fill(0x3d3028));
      list.addChild(makeText(chain.name, PANEL_X + 20, y + 4, 12, 0xffd27a));
      const step = (PANEL_W - 40) / chain.stages.length;
      chain.stages.forEach((st, i) => {
        const icon = iconSprite(st.id, PANEL_X + 22 + i * step, y + 18, 30);
        if (icon) list.addChild(icon);
        if (i > 0) list.addChild(makeText("›", PANEL_X + 22 + i * step - 12, y + 22, 16, 0x8a847b));
      });
      y += CHAIN_ROW_H;
    }

    const daily = recipes.filter((r) => r.tier === "daily");
    const open = daily.filter((r) => this.chainsUnlocked(r));
    y += this.section(list, y, `調味料理 ${open.length}/${daily.length}`);
    for (const r of open) y += this.recipeRow(list, y, r, 0x8a6a4a, "可直接合成・訂單獎勵 ×" + TIER_REWARD_MULT.daily, true);
    if (open.length < daily.length) {
      list.addChild(makeText(`還有 ${daily.length - open.length} 道會隨劇情解鎖`, PANEL_X + 20, y + 4, 12, 0x8a847b));
      y += 28;
    }
    return y - top;
  }

  private drawSpecial(list: Container, top: number): number {
    let y = top;
    for (const { tier, label, color } of SPECIAL_TIERS) {
      y += this.section(list, y, label, color);
      for (const r of recipes.filter((x) => x.tier === tier)) {
        const unlocked = this.game.isRecipeUnlocked(r.result.id);
        y += this.recipeRow(list, y, r, color, unlocked ? `已解鎖・訂單獎勵 ×${TIER_REWARD_MULT[tier]}` : this.howToUnlock(r), unlocked);
      }
    }
    return y - top;
  }

  private chainsUnlocked(r: RecipeDef): boolean {
    return this.game.unlocked.includes(getItem(r.dish)!.chainId) && this.game.unlocked.includes(getItem(r.seasoning)!.chainId);
  }

  private howToUnlock(r: RecipeDef): string {
    const g = this.game;
    const task = taskForRecipe(r.result.id);
    if (task) {
      const p = taskProgress(task, g);
      const what = task.goal.type === "make" ? `製作${getItem(task.goal.itemId)!.name}` : "交付隨機訂單";
      return `任務「${task.name}」：${what} ${p.have}/${p.need}`;
    }
    if (r.result.id === SHARD_RECIPE) return `Boss 關碎片 ${Math.min(g.shards, SHARDS_NEEDED)}/${SHARDS_NEEDED}`;
    const product = products.find((p) => p.effect.type === "unlockRecipe" && p.effect.recipe === r.result.id);
    if (product) return `商店購買 🪙${product.cost}`;
    return "尚未開放";
  }

  /** "[seasoning] + [dish] → [result]  name" with a status line; locked recipes are dimmed. */
  private recipeRow(list: Container, y: number, r: RecipeDef, color: number, status: string, unlocked: boolean): number {
    list.addChild(new Graphics().roundRect(PANEL_X + 12, y, PANEL_W - 24, RECIPE_ROW_H - 6, 8).fill(0x3d3028).stroke({ width: 2, color }));
    const x = PANEL_X + 20;
    const icons = [
      iconSprite(r.seasoning, x, y + 6, 28),
      iconSprite(r.dish, x + 40, y + 6, 28),
      iconSprite(r.result.id, x + 86, y + 2, 36),
    ];
    for (const icon of icons) {
      if (!icon) continue;
      if (!unlocked) icon.alpha = 0.45;
      list.addChild(icon);
    }
    list.addChild(makeText("+", x + 29, y + 10, 14, 0xd8cbb8), makeText("→", x + 70, y + 10, 14, 0xd8cbb8));
    list.addChild(makeText(unlocked ? r.result.name : `？ ${r.result.name}`, x + 128, y + 6, 14, unlocked ? 0xffffff : 0xb8ad9c, PANEL_W - 160));
    const sub = `${getItem(r.seasoning)!.name} + ${getItem(r.dish)!.name}`;
    list.addChild(makeText(sub, x + 128, y + 26, 10, 0x9a8f80, PANEL_W - 160));
    list.addChild(makeText(status, x, y + 40, 11, unlocked ? 0x8fe388 : 0xe8a05f, PANEL_W - 44));
    return RECIPE_ROW_H;
  }
}
