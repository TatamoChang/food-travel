import { Graphics, type Text } from "pixi.js";
import type { Game } from "../core/game";
import { PRODUCT_CATEGORIES, describeEffect, productCategory, products, purchaseLimit, type ProductCategory } from "../core/shop";
import { PANEL_W, PANEL_X, ScrollPanel } from "./Panel";
import { makeText } from "./ui";

const ROW_H = 66;
const TAB_H = 44;

/** Overlay listing shop products by category tab. Add products in src/data/shop.json; tabs come from productCategory(). */
export class ShopView extends ScrollPanel {
  private tab: ProductCategory = "energy";
  /** Description labels of active boosts, refreshed every frame for the countdown. */
  private readonly countdowns = new Map<string, { text: Text; base: string }>();

  constructor(
    private readonly game: Game,
    private readonly onChange: () => void,
  ) {
    super("商店");
  }

  /** Open on `tab` (e.g. energy from the low-energy toast), or on the last tab used. */
  open(tab?: ProductCategory) {
    if (tab && tab !== this.tab) {
      this.tab = tab;
      this.resetScroll();
    }
    this.render();
  }

  /** Per-frame refresh of countdown labels; avoids rebuilding buttons mid-click. */
  update() {
    if (!this.isOpen) return;
    const now = Date.now();
    for (const [id, c] of this.countdowns) {
      const end = this.game.boostExpiresAt(id);
      if (end === null) {
        c.text.text = c.base;
        continue;
      }
      const left = Math.max(0, Math.ceil((end - now) / 1000));
      c.text.text = `${c.base}　剩 ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    }
  }

  private render() {
    this.countdowns.clear();
    this.build(`🪙 ${this.game.coins}`, (list) => {
      const tabW = (PANEL_W - 24 - 6 * (PRODUCT_CATEGORIES.length - 1)) / PRODUCT_CATEGORIES.length;
      PRODUCT_CATEGORIES.forEach((c, i) => {
        const x = PANEL_X + 12 + i * (tabW + 6);
        if (c.id !== this.tab) {
          this.button(list, { x, y: 0, w: tabW, h: 32 }, c.label, true, () => this.open(c.id));
          return;
        }
        // Selected tab: gold, not tappable.
        list.addChild(new Graphics().roundRect(x, 0, tabW, 32, 8).fill(0xffd27a));
        const t = makeText(c.label, 0, 0, 13, 0x1d1712);
        t.style.fontWeight = "bold";
        t.position.set(x + (tabW - t.width) / 2, (32 - t.height) / 2);
        list.addChild(t);
      });
      const shown = products.filter((p) => productCategory(p) === this.tab);
      shown.forEach((p, i) => {
        const y = TAB_H + i * ROW_H;
        list.addChild(new Graphics().roundRect(PANEL_X + 12, y, PANEL_W - 24, ROW_H - 6, 10).fill(0x3d3028));
        const name = makeText(p.name, PANEL_X + 24, y + 8, 15);
        list.addChild(name);
        const missing = this.game.missingRequirement(p.id);
        const base = missing ? `需先${missing}` : describeEffect(p.effect);
        const desc = makeText(base, PANEL_X + 24, y + 32, 12, missing ? 0xe8a05f : 0x9fc3e8);
        list.addChild(desc);
        if (p.effect.type === "maxEnergyBoost") this.countdowns.set(p.id, { text: desc, base });

        const limit = purchaseLimit(p);
        const bought = this.game.purchaseCount(p.id);
        const owned = bought >= limit;
        const label = owned ? (limit > 1 ? "已買完" : "已購買") : `🪙${p.cost}`;
        // Products that can be bought several times show the count next to the name.
        if (limit > 1 && limit !== Infinity) list.addChild(makeText(`已購 ${bought}/${limit}`, name.x + name.width + 8, y + 10, 12, 0xd8cbb8));
        const enabled = !owned && !missing && this.game.coins >= p.cost;
        this.button(list, { x: PANEL_X + PANEL_W - 96, y: y + 12, w: 72, h: 34 }, label, enabled, () => {
          this.game.buy(p.id);
          this.render();
          this.onChange();
        });
      });
      return TAB_H + shown.length * ROW_H;
    });
  }
}
