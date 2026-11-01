import { Graphics } from "pixi.js";
import type { Game } from "../core/game";
import { themeProduct } from "../core/shop";
import { PANEL_W, PANEL_X, ScrollPanel } from "./Panel";
import { backdropSprite } from "./icons";
import { THEMES } from "./themes";
import { makeText } from "./ui";

const ROW_H = 132;
const THUMB = 0.16;

/** Theme picker: thumbnail, name, description and swatches per theme; buy paid themes, apply owned ones. */
export class ThemeView extends ScrollPanel {
  private current = "";

  constructor(
    private readonly game: Game,
    private readonly onApply: (id: string) => void,
    private readonly onChange: () => void,
  ) {
    super("主題");
  }

  open(currentId: string) {
    this.current = currentId;
    this.render();
  }

  private render() {
    const g = this.game;
    this.build(`🪙 ${g.coins}`, (list) => {
      THEMES.forEach((t, i) => {
        const y = i * ROW_H;
        const active = t.id === this.current;
        list.addChild(
          new Graphics()
            .roundRect(PANEL_X + 12, y, PANEL_W - 24, ROW_H - 8, 10)
            .fill(0x3d3028)
            .stroke({ width: active ? 3 : 0, color: t.accent }),
        );
        const tx = PANEL_X + 20;
        const ty = y + 8;
        const art = backdropSprite(t.id, tx, ty, THUMB);
        if (art) list.addChild(art);
        else list.addChild(new Graphics().roundRect(tx, ty, 360 * THUMB, 720 * THUMB, 4).fill(t.background).stroke({ width: 2, color: t.prepFrame }));

        const x = tx + 360 * THUMB + 12;
        list.addChild(makeText(t.name, x, y + 10, 16, 0xffffff));
        list.addChild(makeText(t.description, x, y + 34, 11, 0xd8cbb8, PANEL_W - (x - PANEL_X) - 16));
        [t.storyCard, t.randomCard, t.button, t.accent, t.prepFrame].forEach((c, k) => {
          list.addChild(new Graphics().roundRect(x + k * 22, y + 62, 18, 18, 4).fill(c).stroke({ width: 1.5, color: 0x1d1712 }));
        });

        const rect = { x, y: y + 88, w: 100, h: 28 };
        if (g.isThemeOwned(t.id)) {
          this.button(list, rect, active ? "使用中" : "套用", !active, () => this.apply(t.id));
        } else {
          // Paid theme: buy it, then apply it straight away.
          const p = themeProduct(t.id)!;
          this.button(list, rect, `🪙${p.cost} 購買`, g.coins >= p.cost, () => {
            if (g.buy(p.id).ok) this.apply(t.id);
            this.onChange();
          });
        }
      });
      return THEMES.length * ROW_H;
    });
  }

  private apply(id: string) {
    this.current = id;
    this.onApply(id);
    this.render();
  }
}
