import { Graphics, type Text } from "pixi.js";
import type { Game } from "../core/game";
import { describeEffect, products } from "../core/shop";
import { PANEL_W, PANEL_X, ScrollPanel } from "./Panel";
import { makeText } from "./ui";

const ROW_H = 66;

/** Overlay listing shop products. Add products in src/data/shop.json; the list is rendered from it. */
export class ShopView extends ScrollPanel {
  /** Description labels of active boosts, refreshed every frame for the countdown. */
  private readonly countdowns = new Map<string, { text: Text; base: string }>();

  constructor(
    private readonly game: Game,
    private readonly onChange: () => void,
  ) {
    super("商店");
  }

  open() {
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
      products.forEach((p, i) => {
        const y = i * ROW_H;
        list.addChild(new Graphics().roundRect(PANEL_X + 12, y, PANEL_W - 24, ROW_H - 6, 10).fill(0x3d3028));
        list.addChild(makeText(p.name, PANEL_X + 24, y + 8, 15));
        const missing = this.game.missingRequirement(p.id);
        const base = missing ? `需先${missing}` : describeEffect(p.effect);
        const desc = makeText(base, PANEL_X + 24, y + 32, 12, missing ? 0xe8a05f : 0x9fc3e8);
        list.addChild(desc);
        if (p.effect.type === "maxEnergyBoost") this.countdowns.set(p.id, { text: desc, base });

        const owned = !!p.once && this.game.isPurchased(p.id);
        const label = owned ? "已購買" : `🪙${p.cost}`;
        const enabled = !owned && !missing && this.game.coins >= p.cost;
        this.button(list, { x: PANEL_X + PANEL_W - 96, y: y + 12, w: 72, h: 34 }, label, enabled, () => {
          this.game.buy(p.id);
          this.render();
          this.onChange();
        });
      });
      return products.length * ROW_H;
    });
  }
}
