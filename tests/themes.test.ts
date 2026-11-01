import { describe, expect, it } from "vitest";
import { Game, newState } from "../src/core/game";
import { mulberry32 } from "../src/core/rng";
import { themeProduct } from "../src/core/shop";
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

describe("theme purchases", () => {
  it("classic is free; each city theme is a once-only product for 50 coins", () => {
    expect(themeProduct("classic")).toBeUndefined();
    for (const t of THEMES.slice(1)) {
      const p = themeProduct(t.id);
      expect(p?.cost, t.id).toBe(50);
      expect(p?.once, t.id).toBe(true);
    }
  });

  it("buying a theme spends 50 coins once and makes it owned", () => {
    const s = newState(0);
    s.coins = 120;
    const g = new Game(s, () => 0, mulberry32(1));
    expect(g.isThemeOwned("classic")).toBe(true);
    expect(g.isThemeOwned("taipei")).toBe(false);
    expect(g.buy("theme_taipei")).toEqual({ ok: true });
    expect(g.coins).toBe(70);
    expect(g.isThemeOwned("taipei")).toBe(true);
    expect(g.buy("theme_taipei")).toEqual({ ok: false, reason: "already-purchased" });
    expect(g.buy("theme_paris").ok).toBe(true);
    expect(g.buy("theme_newyork")).toEqual({ ok: false, reason: "no-coins" });
    const g2 = new Game(JSON.parse(JSON.stringify(g.snapshot())), () => 0, mulberry32(1));
    expect(g2.isThemeOwned("paris")).toBe(true);
    expect(g2.isThemeOwned("newyork")).toBe(false);
  });
});
