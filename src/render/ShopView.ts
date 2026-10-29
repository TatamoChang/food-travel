import { Container, Graphics, type Text } from "pixi.js";
import type { Game } from "../core/game";
import { describeEffect, products } from "../core/shop";
import { VIEW_H, VIEW_W } from "./layout";
import { addButton, makeText } from "./ui";

const PANEL_X = 20;
const PANEL_Y = 30;
const PANEL_W = VIEW_W - 40;
const ROW_H = 66;

/** Full-screen overlay listing shop products. Add products in src/data/shop.json; the list is rendered from it. */
export class ShopView {
  readonly container = new Container();
  /** Description labels of active boosts, refreshed every frame for the countdown. */
  private readonly countdowns = new Map<string, { text: Text; base: string }>();

  constructor(
    private readonly game: Game,
    private readonly onChange: () => void,
  ) {
    this.container.visible = false;
  }

  open() {
    this.container.visible = true;
    this.render();
  }

  close() {
    this.container.visible = false;
  }

  /** Per-frame refresh of countdown labels; avoids rebuilding buttons mid-click. */
  update() {
    if (!this.container.visible) return;
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
    const c = this.container;
    c.removeChildren().forEach((n) => n.destroy({ children: true }));
    this.countdowns.clear();

    // Backdrop swallows pointer input so the board underneath can't be dragged.
    const backdrop = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x000000, alpha: 0.7 });
    backdrop.eventMode = "static";
    c.addChild(backdrop);

    const panelH = 80 + products.length * ROW_H + 56;
    c.addChild(new Graphics().roundRect(PANEL_X, PANEL_Y, PANEL_W, panelH, 14).fill(0x2a2420));
    c.addChild(makeText("商店", PANEL_X + 16, PANEL_Y + 12, 20));
    c.addChild(makeText(`🪙 ${this.game.coins}`, PANEL_X + 16, PANEL_Y + 46, 15, 0xffd27a));

    products.forEach((p, i) => {
      const y = PANEL_Y + 80 + i * ROW_H;
      c.addChild(new Graphics().roundRect(PANEL_X + 12, y, PANEL_W - 24, ROW_H - 6, 10).fill(0x3d3028));
      c.addChild(makeText(p.name, PANEL_X + 24, y + 8, 15));
      const base = describeEffect(p.effect);
      const desc = makeText(base, PANEL_X + 24, y + 32, 12, 0x9fc3e8);
      c.addChild(desc);
      if (p.effect.type === "maxEnergyBoost") this.countdowns.set(p.id, { text: desc, base });

      const owned = !!p.once && this.game.isPurchased(p.id);
      const label = owned ? "已購買" : `🪙${p.cost}`;
      addButton(c, { x: PANEL_X + PANEL_W - 96, y: y + 12, w: 72, h: 34 }, label, !owned && this.game.coins >= p.cost, () => {
        this.game.buy(p.id);
        this.render();
        this.onChange();
      });
    });

    addButton(c, { x: PANEL_X + 12, y: PANEL_Y + panelH - 48, w: PANEL_W - 24, h: 36 }, "關閉", true, () => this.close());
  }
}
