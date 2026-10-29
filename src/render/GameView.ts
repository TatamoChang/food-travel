import { Application, Container, Graphics, Text, type FederatedPointerEvent } from "pixi.js";
import { Board, COLS, ROWS } from "../core/board";
import type { Game } from "../core/game";
import { story, type Requirement } from "../core/orders";
import { getItem, stageLabels } from "../core/registry";

export const VIEW_W = 360;
export const VIEW_H = 720;

const CELL = 56;
const BOARD_X = (VIEW_W - COLS * CELL) / 2;
const BOARD_Y = 266;
const DRAG_THRESHOLD = 6;

const CHAIN_COLORS: Record<string, number> = {
  pizza: 0xe8b04a,
  sushi: 0x6fbf73,
  croissant: 0xe07a5f,
};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

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
  private drag: Drag | null = null;

  constructor(
    private readonly app: Application,
    private readonly game: Game,
    private readonly onChange: () => void,
  ) {
    this.root.addChild(this.layer);
    this.hud = new Text({ text: "", style: { fill: 0xffffff, fontSize: 15 } });
    this.hud.position.set(12, 10);
    this.root.addChild(this.hud);
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
    const now = Date.now();
    const e = this.game.energy;
    const next = e.msToNext(now);
    const timer = next > 0 ? ` (+1 ${Math.ceil(next / 1000)}s)` : "";
    this.hud.text = `⚡ ${e.value}/${e.max}${timer}    🪙 ${this.game.coins}`;
  }

  private cellRect(i: number): Rect {
    return { x: BOARD_X + Board.col(i) * CELL, y: BOARD_Y + Board.row(i) * CELL, w: CELL, h: CELL };
  }

  private cellAt(x: number, y: number): number | null {
    const c = Math.floor((x - BOARD_X) / CELL);
    const r = Math.floor((y - BOARD_Y) / CELL);
    return c >= 0 && c < COLS && r >= 0 && r < ROWS ? r * COLS + c : null;
  }

  private text(str: string, x: number, y: number, size: number, fill = 0xffffff, wrap = 0): Text {
    const t = new Text({
      text: str,
      style: { fill, fontSize: size, wordWrap: wrap > 0, wordWrapWidth: wrap, breakWords: true },
    });
    t.position.set(x, y);
    // The stage is "static", so descendants inherit hit-testing; without this a label would swallow clicks meant for the button/item beneath it.
    t.eventMode = "none";
    return t;
  }

  render() {
    this.layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.drawOrders();
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
      const label = `${stageLabels[info.stageIndex]} ${info.name}\n${Math.min(have, r.count)}/${r.count}`;
      this.layer.addChild(this.text(label, x + col * colW, y + row * lineH, 12, have >= r.count ? 0x8fe388 : 0xffffff, colW - 4));
    });
  }

  private drawButton(rect: Rect, label: string, enabled: boolean, onTap: () => void) {
    const b = new Graphics().roundRect(rect.x, rect.y, rect.w, rect.h, 8).fill(enabled ? 0x3f9d4f : 0x555049);
    const t = this.text(label, 0, 0, 13, enabled ? 0xffffff : 0x8a847b);
    t.position.set(rect.x + (rect.w - t.width) / 2, rect.y + (rect.h - t.height) / 2);
    if (enabled) {
      b.eventMode = "static";
      b.cursor = "pointer";
      b.on("pointertap", () => {
        onTap();
        this.render();
        this.onChange();
      });
    }
    this.layer.addChild(b, t);
  }

  private drawOrders() {
    const g = this.game;
    const stage = g.currentStage;

    const storyRect: Rect = { x: 12, y: 40, w: VIEW_W - 24, h: 86 };
    this.layer.addChild(new Graphics().roundRect(storyRect.x, storyRect.y, storyRect.w, storyRect.h, 10).fill(0x3d3028));
    if (stage) {
      this.layer.addChild(this.text(`劇情 ${g.stageIndex + 1}/${story.stages.length}　${stage.title}　獎勵 🪙${stage.reward}`, 22, 46, 13, 0xffd27a));
      this.drawRequirements(stage.requirements, 22, 70, 82, 3, 34);
      this.drawButton({ x: 276, y: 74, w: 62, h: 34 }, "交付", g.canDeliverStory(), () => g.deliverStory());
    } else {
      this.layer.addChild(this.text("🎉 劇情全部完成！", 22, 70, 16, 0xffd27a));
    }

    g.randomOrders.forEach((o, i) => {
      const rect: Rect = { x: 12 + i * 118, y: 134, w: 112, h: 120 };
      this.layer.addChild(new Graphics().roundRect(rect.x, rect.y, rect.w, rect.h, 10).fill(0x2c3a4a));
      this.layer.addChild(this.text("隨機訂單", rect.x + 8, rect.y + 5, 11, 0x9fc3e8));
      this.drawRequirements(o.requirements, rect.x + 8, rect.y + 22, 100, 1, 32);
      this.drawButton({ x: rect.x + 8, y: rect.y + 90, w: rect.w - 16, h: 24 }, `交付 🪙${o.reward}`, g.canDeliverRandom(o.id), () => g.deliverRandom(o.id));
    });
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
    const g = new Graphics().roundRect(4, 4, CELL - 8, CELL - 8, 8);
    if (info.kind === "generator") {
      g.fill(0x1f1a17).stroke({ width: 3, color });
    } else {
      g.fill(color);
      g.alpha = 0.55 + info.stageIndex * 0.1125;
    }
    c.addChild(g);
    const letter = info.kind === "generator" ? "產" : stageLabels[info.stageIndex];
    const lt = this.text(letter, 8, 6, 13, info.kind === "generator" ? color : 0x1f1a17);
    lt.style.fontWeight = "bold";
    c.addChild(lt);
    const name = this.text(info.name, 6, 24, 10, info.kind === "generator" ? 0xffffff : 0x1f1a17, CELL - 12);
    c.addChild(name);
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

    if (!d.moved) {
      g.tap(d.from);
    } else {
      const to = this.cellAt(p.x, p.y);
      if (to !== null) g.move(d.from, to);
    }
    this.render();
    this.onChange();
  }
}
