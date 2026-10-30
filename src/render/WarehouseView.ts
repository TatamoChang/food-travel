import { Graphics, type Container } from "pixi.js";
import { STATIONS, STATION_SLOTS, type Game } from "../core/game";
import { getItem, itemLabel } from "../core/registry";
import { STATION_NAMES } from "../core/shop";
import { PANEL_W, PANEL_X, ScrollPanel } from "./Panel";
import { iconSprite } from "./icons";
import { makeText } from "./ui";

const ROW_H = 44;
const SECTION_H = 28;

/** Overlay for the warehouse: take generators off the stations, and put warehouse entries back. */
export class WarehouseView extends ScrollPanel {
  constructor(
    private readonly game: Game,
    private readonly onChange: () => void,
  ) {
    super("倉庫");
  }

  open() {
    this.render();
  }

  private act(action: () => void) {
    action();
    this.render();
    this.onChange();
  }

  private row(list: Container, y: number, label: string, color: number, itemId?: string) {
    list.addChild(new Graphics().roundRect(PANEL_X + 12, y, PANEL_W - 24, ROW_H - 6, 8).fill(0x3d3028));
    const icon = itemId ? iconSprite(itemId, PANEL_X + 18, y + 3, 32) : null;
    if (icon) list.addChild(icon);
    list.addChild(makeText(label, PANEL_X + (icon ? 56 : 24), y + 10, 14, color));
  }

  private render() {
    const g = this.game;
    this.build("產出器放在台上才能使用", (list) => {
      let y = 0;
      for (const station of STATIONS) {
        list.addChild(makeText(STATION_NAMES[station], PANEL_X + 16, y + 4, 14, 0x9fc3e8));
        y += SECTION_H;
        for (let slot = 0; slot < STATION_SLOTS; slot++) {
          const id = g.stations[station][slot];
          if (slot >= g.slotsOpen[station]) this.row(list, y, `第 ${slot + 1} 格　🔒 到商店開放`, 0x8a847b);
          else if (!id) this.row(list, y, `第 ${slot + 1} 格　（空）`, 0x8a847b);
          else {
            this.row(list, y, `第 ${slot + 1} 格　${getItem(id)!.name}`, 0xffffff, id);
            this.button(list, { x: PANEL_X + PANEL_W - 88, y: y + 5, w: 64, h: 28 }, "收回", true, () =>
              this.act(() => g.storeFromStation(station, slot)),
            );
          }
          y += ROW_H;
        }
      }

      list.addChild(makeText(`倉庫內（${g.warehouse.length}）`, PANEL_X + 16, y + 4, 14, 0x9fc3e8));
      y += SECTION_H;
      if (g.warehouse.length === 0) {
        list.addChild(makeText("空的", PANEL_X + 24, y + 4, 13, 0x8a847b));
        y += ROW_H;
      }
      g.warehouse.forEach((id, i) => {
        const info = getItem(id)!;
        const label = info.kind === "generator" ? `${info.name}（產出器）` : `${itemLabel(id)} ${info.name}`;
        this.row(list, y, label, 0xffffff, id);
        this.button(list, { x: PANEL_X + PANEL_W - 88, y: y + 5, w: 64, h: 28 }, "放入", g.canPlace(i), () =>
          this.act(() => g.placeFromWarehouse(i)),
        );
        y += ROW_H;
      });
      return y;
    });
  }
}
