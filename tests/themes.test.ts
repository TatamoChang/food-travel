import { describe, expect, it } from "vitest";
import { THEMES, getTheme } from "../src/render/themes";

describe("themes", () => {
  it("offer classic plus Taipei, New York and Paris, each city with a backdrop", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["classic", "taipei", "newyork", "paris"]);
    const backdrops = Object.keys(import.meta.glob("../src/assets/themes/*.svg"));
    for (const t of THEMES.slice(1)) expect(backdrops, t.id).toContain(`../src/assets/themes/${t.id}.svg`);
  });

  it("falls back to classic for unknown ids (e.g. a removed theme in storage)", () => {
    expect(getTheme("nope").id).toBe("classic");
    expect(getTheme("paris").name).toBe("法國巴黎");
  });
});
