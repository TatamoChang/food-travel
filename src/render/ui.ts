import { Container, Graphics, Text } from "pixi.js";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Non-interactive label. The stage is "static", so descendants inherit hit-testing; "none" keeps a label from swallowing clicks meant for what is beneath it. */
export function makeText(str: string, x: number, y: number, size: number, fill = 0xffffff, wrap = 0): Text {
  const t = new Text({
    text: str,
    style: { fill, fontSize: size, wordWrap: wrap > 0, wordWrapWidth: wrap, breakWords: true },
  });
  t.position.set(x, y);
  t.eventMode = "none";
  return t;
}

/** Fill of enabled buttons; the active theme sets it. */
let buttonColor = 0x3f9d4f;

export function setButtonColor(color: number) {
  buttonColor = color;
}

export function addButton(parent: Container, rect: Rect, label: string, enabled: boolean, onTap: () => void) {
  const b = new Graphics().roundRect(rect.x, rect.y, rect.w, rect.h, 8).fill(enabled ? buttonColor : 0x555049);
  const t = makeText(label, 0, 0, 13, enabled ? 0xffffff : 0x8a847b);
  t.position.set(rect.x + (rect.w - t.width) / 2, rect.y + (rect.h - t.height) / 2);
  if (enabled) {
    b.eventMode = "static";
    b.cursor = "pointer";
    b.on("pointertap", onTap);
  }
  parent.addChild(b, t);
}
