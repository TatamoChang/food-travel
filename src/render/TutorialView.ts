import { Container, Graphics } from "pixi.js";
import { VIEW_H, VIEW_W } from "./layout";
import { loadSeenSteps, saveSeenSteps, unseenSteps, TUTORIAL_STEPS, type TutorialStep } from "./tutorialSteps";
import { addButton, makeText } from "./ui";

const BUBBLE_W = 312;
const PAD = 14;

/** Step-by-step walkthrough: dims the screen, cuts a highlight around the target, and shows a speech bubble. */
export class TutorialView {
  readonly container = new Container();
  private steps: TutorialStep[] = [];
  private index = 0;

  constructor(private readonly accent: () => number) {
    this.container.visible = false;
    this.container.eventMode = "static";
  }

  get isOpen() {
    return this.container.visible;
  }

  /** Show the steps this device hasn't seen (first launch: all of them). Does nothing when everything was seen. */
  showUnseen() {
    this.start(unseenSteps(loadSeenSteps()));
  }

  /** Replay the whole walkthrough. */
  replay() {
    this.start([...TUTORIAL_STEPS]);
  }

  private start(steps: TutorialStep[]) {
    if (steps.length === 0) return;
    this.steps = steps;
    this.index = 0;
    this.container.visible = true;
    this.render();
  }

  private markSeen(ids: string[]) {
    saveSeenSteps([...loadSeenSteps(), ...ids]);
  }

  private next() {
    this.markSeen([this.steps[this.index].id]);
    this.index++;
    if (this.index >= this.steps.length) this.close();
    else this.render();
  }

  private prev() {
    if (this.index === 0) return;
    this.index--;
    this.render();
  }

  private skip() {
    this.markSeen(this.steps.map((s) => s.id));
    this.close();
  }

  private close() {
    this.container.visible = false;
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private render() {
    const c = this.container;
    c.removeChildren().forEach((n) => n.destroy({ children: true }));
    const step = this.steps[this.index];
    const t = step.target;
    const accent = this.accent();

    // Dim everything except the highlighted target; the dim layer also swallows input.
    const dim = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x000000, alpha: 0.72 });
    if (t) dim.roundRect(t.x - 4, t.y - 4, t.w + 8, t.h + 8, 10).cut();
    dim.eventMode = "static";
    c.addChild(dim);
    if (t) c.addChild(new Graphics().roundRect(t.x - 4, t.y - 4, t.w + 8, t.h + 8, 10).stroke({ width: 3, color: accent }));

    const text = makeText(step.text, 0, 0, 14, 0x1d1712, BUBBLE_W - PAD * 2);
    const bubbleH = text.height + PAD * 2 + 44;
    const x = (VIEW_W - BUBBLE_W) / 2;
    // Bubble goes below a target in the upper half, above one in the lower half, centred when there is none.
    let y = (VIEW_H - bubbleH) / 2;
    if (t) y = t.y + t.h / 2 < VIEW_H / 2 ? t.y + t.h + 16 : t.y - bubbleH - 16;
    y = Math.max(8, Math.min(VIEW_H - bubbleH - 8, y));
    c.addChild(new Graphics().roundRect(x, y, BUBBLE_W, bubbleH, 14).fill(0xfff6e0).stroke({ width: 3, color: 0x1d1712 }));
    text.position.set(x + PAD, y + PAD);
    c.addChild(text);

    const last = this.index === this.steps.length - 1;
    const by = y + bubbleH - 40;
    c.addChild(makeText(`${this.index + 1}/${this.steps.length}`, x + PAD, by + 8, 12, 0x8a7a66));
    // Right-aligned row: 上一步 (not on the first step), 略過 (not on the last), 下一步/開始玩.
    const right = x + BUBBLE_W - PAD;
    addButton(c, { x: right - 90, y: by, w: 90, h: 30 }, last ? "開始玩！" : "下一步 ▶", true, () => this.next());
    if (!last) addButton(c, { x: right - 90 - 6 - 56, y: by, w: 56, h: 30 }, "略過", true, () => this.skip());
    if (this.index > 0) addButton(c, { x: right - 90 - 6 - 56 - 6 - 84, y: by, w: 84, h: 30 }, "◀ 上一步", true, () => this.prev());
  }
}
