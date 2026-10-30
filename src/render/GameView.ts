import { Application, Container, Graphics, Rectangle, type Text, type FederatedPointerEvent } from "pixi.js";
import { Board, COLS, ROWS } from "../core/board";
import { Game, STATIONS, STATION_SLOTS, type StationId } from "../core/game";
import { story, type Requirement } from "../core/orders";
import { getItem, itemLabel } from "../core/registry";
import { STATION_NAMES } from "../core/shop";
import { VIEW_H, VIEW_W } from "./layout";
import { ShopView } from "./ShopView";
import { WarehouseView } from "./WarehouseView";
import { iconSprite } from "./icons";
import { addButton, makeText, type Rect } from "./ui";

const CELL = 56;
const BOARD_X = (VIEW_W - COLS * CELL) / 2;
/** Top of the station row; the normal grid starts one cell below. */
const BOARD_Y = 266;
const GRID_Y = BOARD_Y + CELL;
const DRAG_THRESHOLD = 6;
/** Icon size on order cards. */
const ICON_SMALL = 26;

const CHAIN_COLORS: Record<string, number> = {
  pizza: 0xe8b04a,
  sushi: 0x6fbf73,
  croissant: 0xe07a5f,
  salt: 0xc9d3dd,
  spice: 0x9a6b3f,
};

const STATION_COLORS: Record<StationId, number> = { prep: 0x6b5235, spice: 0x4f6138 };

interface Drag {
  from: number;
  node: Container;
  startX: number;
  startY: number;
  offX: number;
  offY: number;
  moved: boolean;
}

export class GameView {
  private readonly root = new Container();
  private readonly layer = new Container();
  private readonly hud: Text;
  private readonly shop: ShopView;
  private readonly warehouse: WarehouseView;
  private drag: Drag | null = null;

  constructor(
    private readonly app: Application,
    private readonly game: Game,
    private readonly onChange: () => void,
  ) {
    this.root.addChild(this.layer);
    this.hud = makeText("", 12, 14, 13);
    this.root.addChild(this.hud);
    // Panel actions can change the stations and board, so redraw before saving.
    const changed = () => {
      this.render();
      onChange();
    };
    this.shop = new ShopView(game, changed);
    this.warehouse = new WarehouseView(game, changed);
    this.root.addChild(this.shop.container, this.warehouse.container);
    app.stage.addChild(this.root);

    app.stage.eventMode = "static";
    app.stage.hitArea = app.screen;
    app.stage.on("pointermove", (e) => this.onMove(e));
    app.stage.on("pointerup", (e) => this.onUp(e));
    app.stage.on("pointerupoutside", (e) => this.onUp(e));
    app.renderer.on("resize", () => this.fit());
    app.ticker.add(() => this.updateHud());

    this.fit();
    this.render();
  }

  private fit() {
    const s = Math.min(this.app.screen.width / VIEW_W, this.app.screen.height / VIEW_H);
    this.root.scale.set(s);
    this.root.position.set((this.app.screen.width - VIEW_W * s) / 2, (this.app.screen.height - VIEW_H * s) / 2);
  }

  private updateHud() {
    this.game.tick();
    this.shop.update();
    const now = Date.now();
    const e = this.game.energy;
    const next = e.msToNext(now);
    const timer = next > 0 ? ` +1 ${Math.ceil(next / 1000)}s` : "";
    this.hud.text = `⚡ ${e.value}/${e.max}${timer}  🪙 ${this.game.coins}`;
  }

  private cellRect(i: number): Rect {
    return { x: BOARD_X + Board.col(i) * CELL, y: GRID_Y + Board.row(i) * CELL, w: CELL, h: CELL };
  }

  private slotRect(station: StationId, slot: number): Rect {
    return { x: BOARD_X + Game.spawnOrigin(station, slot) * CELL, y: BOARD_Y, w: CELL, h: CELL };
  }

  /** Normal grid cell under a point; the station row is not a drop target. */
  private cellAt(x: number, y: number): number | null {
    const c = Math.floor((x - BOARD_X) / CELL);
    const r = Math.floor((y - GRID_Y) / CELL);
    return c >= 0 && c < COLS && r >= 0 && r < ROWS ? r * COLS + c : null;
  }

  render() {
    this.layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.drawHudButtons();
    this.drawOrders();
    this.drawStations();
    this.drawBoard();
    this.updateHud();
  }

  /** Requirement lines: "B 披薩餅皮" over "have/need", green when the board covers it. */
  private drawRequirements(reqs: readonly Requirement[], x: number, y: number, colW: number, perRow: number, lineH: number) {
    reqs.forEach((r, i) => {
      const info = getItem(r.itemId)!;
      const have = this.game.board.count(r.itemId);
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const label = `${itemLabel(r.itemId)} ${info.name}\n${Math.min(have, r.count)}/${r.count}`;
      const ix = x + col * colW;
      const iy = y + row * lineH;
      const icon = iconSprite(r.itemId, ix, iy + 2, ICON_SMALL);
      if (icon) this.layer.addChild(icon);
      const tx = icon ? ix + ICON_SMALL + 2 : ix;
      this.layer.addChild(makeText(label, tx, iy, 11, have >= r.count ? 0x8fe388 : 0xffffff, colW - (tx - ix) - 2));
    });
  }

  /** Button whose action mutates the game; the board is redrawn and the save hook fires afterwards. */
  private button(rect: Rect, label: string, enabled: boolean, action: () => void) {
    addButton(this.layer, rect, label, enabled, () => {
      action();
      this.render();
      this.onChange();
    });
  }

  /** Lives in the rebuilt layer so the warehouse count stays current. */
  private drawHudButtons() {
    const n = this.game.warehouse.length;
    addButton(this.layer, { x: VIEW_W - 162, y: 6, w: 72, h: 28 }, n > 0 ? `📦 倉庫 ${n}` : "📦 倉庫", true, () => this.warehouse.open());
    addButton(this.layer, { x: VIEW_W - 84, y: 6, w: 72, h: 28 }, "🛒 商店", true, () => this.shop.open());
  }

  private drawOrders() {
    const g = this.game;
    const stage = g.currentStage;

    const storyRect: Rect = { x: 12, y: 40, w: VIEW_W - 24, h: 86 };
    this.layer.addChild(new Graphics().roundRect(storyRect.x, storyRect.y, storyRect.w, storyRect.h, 10).fill(0x3d3028));
    if (stage) {
      this.layer.addChild(makeText(`劇情 ${g.stageIndex + 1}/${story.stages.length}　${stage.title}　獎勵 🪙${stage.reward} ⚡${stage.rewardEnergy}`, 22, 46, 13, 0xffd27a));
      this.drawRequirements(stage.requirements, 22, 70, 82, 3, 34);
      this.button({ x: 276, y: 74, w: 62, h: 34 }, "交付", g.canDeliverStory(), () => g.deliverStory());
    } else {
      this.layer.addChild(makeText("🎉 劇情全部完成！", 22, 70, 16, 0xffd27a));
    }

    g.randomOrders.forEach((o, i) => {
      const rect: Rect = { x: 12 + i * 118, y: 134, w: 112, h: 120 };
      this.layer.addChild(new Graphics().roundRect(rect.x, rect.y, rect.w, rect.h, 10).fill(0x2c3a4a));
      this.layer.addChild(makeText("隨機訂單", rect.x + 8, rect.y + 5, 11, 0x9fc3e8));
      this.drawRequirements(o.requirements, rect.x + 8, rect.y + 22, 100, 1, 32);
      this.button({ x: rect.x + 8, y: rect.y + 90, w: rect.w - 16, h: 24 }, `交付 🪙${o.reward}`, g.canDeliverRandom(o.id), () => g.deliverRandom(o.id));
    });
  }

  /** Top row: prep station (left 3) and spice rack (right 3). Tap a generator to produce; locked slots open the shop. */
  private drawStations() {
    const g = this.game;
    for (const station of STATIONS) {
      const first = this.slotRect(station, 0);
      const color = STATION_COLORS[station];
      this.layer.addChild(new Graphics().roundRect(first.x, first.y, CELL * STATION_SLOTS, CELL, 8).fill(0x2a2420).stroke({ width: 2, color }));
      for (let slot = 0; slot < STATION_SLOTS; slot++) {
        const r = this.slotRect(station, slot);
        const id = g.stations[station][slot];
        if (slot >= g.slotsOpen[station]) {
          this.slotHint(r, `🔒\n${STATION_NAMES[station]}`, () => this.shop.open());
        } else if (!id) {
          this.slotHint(r, `${STATION_NAMES[station]}\n空`, () => this.warehouse.open());
        } else {
          const node = this.makeItem(id);
          node.position.set(r.x, r.y);
          node.eventMode = "static";
          node.cursor = "pointer";
          node.on("pointertap", () => {
            if (this.drag) return;
            g.tapStation(station, slot);
            this.render();
            this.onChange();
          });
          this.layer.addChild(node);
        }
      }
    }
  }

  private slotHint(r: Rect, label: string, onTap: () => void) {
    const hit = new Graphics().roundRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8, 8).fill({ color: 0x000000, alpha: 0.25 });
    hit.eventMode = "static";
    hit.cursor = "pointer";
    hit.on("pointertap", onTap);
    const t = makeText(label, 0, 0, 10, 0x8a847b);
    t.style.align = "center";
    t.position.set(r.x + (r.w - t.width) / 2, r.y + (r.h - t.height) / 2);
    this.layer.addChild(hit, t);
  }

  private drawBoard() {
    for (let i = 0; i < COLS * ROWS; i++) {
      const r = this.cellRect(i);
      this.layer.addChild(new Graphics().roundRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 6).fill(0x2a2420));
    }
    this.game.board.cells.forEach((id, i) => {
      if (!id) return;
      const node = this.makeItem(id);
      const r = this.cellRect(i);
      node.position.set(r.x, r.y);
      node.eventMode = "static";
      node.cursor = "pointer";
      node.on("pointerdown", (e) => this.onDown(e, i, node));
      this.layer.addChild(node);
    });
  }

  private makeItem(id: string): Container {
    const info = getItem(id)!;
    const color = CHAIN_COLORS[info.chainId] ?? 0x999999;
    const c = new Container();
    c.hitArea = new Rectangle(0, 0, CELL, CELL);
    const icon = iconSprite(id, 4, 4, CELL - 8);
    if (info.kind === "generator") {
      c.addChild(new Graphics().roundRect(3, 3, CELL - 6, CELL - 6, 8).fill(0x1f1a17).stroke({ width: 3, color }));
    } else if (info.kind === "special") {
      c.addChild(new Graphics().roundRect(3, 3, CELL - 6, CELL - 6, 8).stroke({ width: 2, color: 0xffd27a, alpha: 0.8 }));
    }
    if (icon) {
      c.addChild(icon);
    } else {
      // No icon drawn yet: coloured block with the name.
      const g = new Graphics().roundRect(4, 4, CELL - 8, CELL - 8, 8).fill(color);
      c.addChild(g, makeText(info.name, 6, 24, 10, 0x1f1a17, CELL - 12));
    }
    if (info.kind !== "generator") {
      const lt = makeText(itemLabel(id), 4, 2, 12, 0xffffff);
      lt.style.fontWeight = "bold";
      lt.style.stroke = { color: 0x1d1712, width: 3 };
      c.addChild(lt);
    }
    return c;
  }

  private local(e: FederatedPointerEvent) {
    return this.root.toLocal(e.global);
  }

  private onDown(e: FederatedPointerEvent, from: number, node: Container) {
    if (this.drag) return;
    const p = this.local(e);
    this.drag = { from, node, startX: p.x, startY: p.y, offX: p.x - node.x, offY: p.y - node.y, moved: false };
    this.layer.addChild(node);
  }

  private onMove(e: FederatedPointerEvent) {
    const d = this.drag;
    if (!d) return;
    const p = this.local(e);
    if (!d.moved && Math.hypot(p.x - d.startX, p.y - d.startY) < DRAG_THRESHOLD) return;
    d.moved = true;
    d.node.position.set(p.x - d.offX, p.y - d.offY);
    d.node.alpha = 0.85;
  }

  private onUp(e: FederatedPointerEvent) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const p = this.local(e);
    const g = this.game;

    if (d.moved) {
      const to = this.cellAt(p.x, p.y);
      if (to !== null) g.move(d.from, to);
    }
    this.render();
    this.onChange();
  }
}
