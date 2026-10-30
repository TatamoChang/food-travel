import { Container, Graphics, Rectangle, type FederatedPointerEvent, type FederatedWheelEvent } from "pixi.js";
import { VIEW_H, VIEW_W } from "./layout";
import { addButton, makeText, type Rect } from "./ui";

export const PANEL_X = 20;
export const PANEL_W = VIEW_W - 40;
const PANEL_Y = 30;
const PANEL_H = VIEW_H - 60;
/** Header area (title + one info line) above the scrolling list. */
const HEADER_H = 80;
const FOOTER_H = 56;
const LIST_Y = PANEL_Y + HEADER_H;
const LIST_H = PANEL_H - HEADER_H - FOOTER_H;
const DRAG_THRESHOLD = 6;

export type ButtonFn = (parent: Container, rect: Rect, label: string, enabled: boolean, onTap: () => void) => void;

/**
 * Full-screen overlay with a title, an info line, a vertically scrolling list (drag or mouse wheel)
 * and a close button. Subclasses call `build` whenever their content changes; the scroll position is kept.
 */
export class ScrollPanel {
  readonly container = new Container();
  private list: Container | null = null;
  private bar: Graphics | null = null;
  private scrollY = 0;
  private maxScroll = 0;
  private drag: { y: number; scroll: number } | null = null;
  /** Set once the current press has scrolled, so the release doesn't also tap a button. */
  private dragged = false;

  constructor(private readonly title: string) {
    this.container.visible = false;
    // Any new press (list or close button) starts out as a tap.
    this.container.eventMode = "static";
    this.container.on("pointerdown", () => (this.dragged = false));
  }

  get isOpen() {
    return this.container.visible;
  }

  close() {
    this.container.visible = false;
    this.drag = null;
  }

  /** Button that ignores the release that ends a scroll drag. */
  protected readonly button: ButtonFn = (parent, rect, label, enabled, onTap) =>
    addButton(parent, rect, label, enabled, () => {
      if (!this.dragged) onTap();
    });

  /**
   * Rebuild the panel. `info` is the line under the title; `fill` draws rows into the list starting at y = 0,
   * using x from PANEL_X, and returns the list's total height.
   */
  protected build(info: string, fill: (list: Container) => number) {
    const c = this.container;
    c.visible = true;
    c.removeChildren().forEach((n) => n.destroy({ children: true }));

    // Backdrop swallows pointer input so the board underneath can't be dragged.
    const backdrop = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x000000, alpha: 0.7 });
    backdrop.eventMode = "static";
    c.addChild(backdrop);
    c.addChild(new Graphics().roundRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 14).fill(0x2a2420));
    c.addChild(makeText(this.title, PANEL_X + 16, PANEL_Y + 12, 20));
    c.addChild(makeText(info, PANEL_X + 16, PANEL_Y + 46, 15, 0xffd27a));

    const viewport = new Container();
    viewport.eventMode = "static";
    viewport.hitArea = new Rectangle(PANEL_X, LIST_Y, PANEL_W, LIST_H);
    const mask = new Graphics().rect(PANEL_X, LIST_Y, PANEL_W, LIST_H).fill(0xffffff);
    viewport.mask = mask;
    const list = new Container();
    viewport.addChild(list);
    c.addChild(viewport, mask);

    const height = fill(list);
    this.list = list;
    this.maxScroll = Math.max(0, height - LIST_H);
    this.bar = null;
    if (this.maxScroll > 0) {
      const barH = Math.max(24, (LIST_H * LIST_H) / height);
      this.bar = new Graphics().roundRect(0, 0, 4, barH, 2).fill({ color: 0xffffff, alpha: 0.35 });
      this.bar.eventMode = "none";
      c.addChild(this.bar);
    }
    this.scrollTo(this.scrollY);

    viewport.on("pointerdown", (e: FederatedPointerEvent) => {
      this.drag = { y: this.localY(e), scroll: this.scrollY };
    });
    viewport.on("globalpointermove", (e: FederatedPointerEvent) => {
      if (!this.drag) return;
      const dy = this.localY(e) - this.drag.y;
      if (!this.dragged && Math.abs(dy) < DRAG_THRESHOLD) return;
      this.dragged = true;
      this.scrollTo(this.drag.scroll - dy);
    });
    const end = () => (this.drag = null);
    viewport.on("pointerup", end);
    viewport.on("pointerupoutside", end);
    viewport.on("wheel", (e: FederatedWheelEvent) => this.scrollTo(this.scrollY + e.deltaY));

    this.button(c, { x: PANEL_X + 12, y: PANEL_Y + PANEL_H - 48, w: PANEL_W - 24, h: 36 }, "關閉", true, () => this.close());
  }

  private localY(e: FederatedPointerEvent) {
    return this.container.toLocal(e.global).y;
  }

  private scrollTo(y: number) {
    this.scrollY = Math.min(this.maxScroll, Math.max(0, y));
    if (this.list) this.list.y = LIST_Y - this.scrollY;
    if (this.bar && this.maxScroll > 0) {
      const travel = LIST_H - this.bar.height;
      this.bar.position.set(PANEL_X + PANEL_W - 8, LIST_Y + (travel * this.scrollY) / this.maxScroll);
    }
  }
}
