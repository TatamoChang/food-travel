import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEMES, getTheme } from "../src/render/themes";

describe("themes", () => {
  it("offer classic plus Taipei, New York and Paris, each city with a backdrop", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["classic", "taipei", "newyork", "paris"]);
    for (const t of THEMES.slice(1)) {
      expect(existsSync(new URL(`../src/assets/themes/${t.id}.svg`, import.meta.url)), t.id).toBe(true);
    }
  });

  it("falls back to classic for unknown ids (e.g. a removed theme in storage)", () => {
    expect(getTheme("nope").id).toBe("classic");
    expect(getTheme("paris").name).toBe("法國巴黎");
  });
});
