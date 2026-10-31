import { describe, expect, it } from "vitest";
import { TUTORIAL_STEPS, unseenSteps } from "../src/render/tutorialSteps";

describe("tutorial", () => {
  it("has unique step ids, starting with a welcome and ending with a send-off", () => {
    const ids = TUTORIAL_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("welcome");
    expect(ids[ids.length - 1]).toBe("done");
  });

  it("shows everything the first time, only unseen steps later, nothing once all are seen", () => {
    expect(unseenSteps([])).toHaveLength(TUTORIAL_STEPS.length);
    const allButOne = TUTORIAL_STEPS.map((s) => s.id).filter((id) => id !== "drops");
    expect(unseenSteps(allButOne).map((s) => s.id)).toEqual(["drops"]);
    expect(unseenSteps(TUTORIAL_STEPS.map((s) => s.id))).toEqual([]);
  });

  it("keeps highlight targets inside the 360x720 view", () => {
    for (const s of TUTORIAL_STEPS) {
      if (!s.target) continue;
      expect(s.target.x).toBeGreaterThanOrEqual(0);
      expect(s.target.y).toBeGreaterThanOrEqual(0);
      expect(s.target.x + s.target.w).toBeLessThanOrEqual(360);
      expect(s.target.y + s.target.h).toBeLessThanOrEqual(720);
    }
  });
});
