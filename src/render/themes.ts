/** Visual themes: backdrop illustration (src/assets/themes/<id>.svg) and UI palette. The choice is a per-device preference, not part of the save. */
export interface Theme {
  id: string;
  name: string;
  description: string;
  /** Screen colour behind everything (and around the 360x720 view on wide screens). */
  background: number;
  /** Board cell fill; translucent when a backdrop should show through. */
  cell: number;
  cellAlpha: number;
  storyCard: number;
  randomCard: number;
  cardAlpha: number;
  /** Story card title and toast border. */
  accent: number;
  /** "隨機訂單" label. */
  subtle: number;
  button: number;
  prepFrame: number;
  spiceFrame: number;
}

export const THEMES: readonly Theme[] = [
  {
    id: "classic",
    name: "經典",
    description: "原本的深色木紋配色",
    background: 0x1f1a17,
    cell: 0x2a2420,
    cellAlpha: 1,
    storyCard: 0x3d3028,
    randomCard: 0x2c3a4a,
    cardAlpha: 1,
    accent: 0xffd27a,
    subtle: 0x9fc3e8,
    button: 0x3f9d4f,
    prepFrame: 0x6b5235,
    spiceFrame: 0x4f6138,
  },
  {
    id: "taipei",
    name: "台灣台北",
    description: "台北 101、夜空與紅燈籠",
    background: 0x241a40,
    cell: 0x1c1230,
    cellAlpha: 0.62,
    storyCard: 0x5a1f2b,
    randomCard: 0x3a2350,
    cardAlpha: 0.92,
    accent: 0xffd34d,
    subtle: 0xf2a6a0,
    button: 0xc8382e,
    prepFrame: 0xe0a63a,
    spiceFrame: 0x4fb3a5,
  },
  {
    id: "newyork",
    name: "美國紐約",
    description: "帝國大廈、自由女神與黃色計程車",
    background: 0x2f5f9a,
    cell: 0x1d2a3a,
    cellAlpha: 0.6,
    storyCard: 0x23344d,
    randomCard: 0x2f4560,
    cardAlpha: 0.92,
    accent: 0xffd34d,
    subtle: 0xa8d0f0,
    button: 0xd98e04,
    prepFrame: 0xf2c230,
    spiceFrame: 0x5fa88f,
  },
  {
    id: "paris",
    name: "法國巴黎",
    description: "艾菲爾鐵塔、粉紫天空與塞納河",
    background: 0x5c4d82,
    cell: 0x2d2a45,
    cellAlpha: 0.55,
    storyCard: 0x3d3560,
    randomCard: 0x4a4470,
    cardAlpha: 0.92,
    accent: 0xffc8dc,
    subtle: 0xd8c8f0,
    button: 0x7a5cc4,
    prepFrame: 0xd4a5c0,
    spiceFrame: 0x8fb3d9,
  },
  {
    id: "halloween",
    name: "萬聖節",
    description: "滿月、鬼屋、蝙蝠與南瓜燈",
    background: 0x1d1238,
    cell: 0x1a1028,
    cellAlpha: 0.62,
    storyCard: 0x3a1f4f,
    randomCard: 0x2e2244,
    cardAlpha: 0.92,
    accent: 0xffb02e,
    subtle: 0xc8b0f0,
    button: 0xe0701e,
    prepFrame: 0xf28c28,
    spiceFrame: 0x8bc34a,
  },
];

const KEY = "food_travel_theme";

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function loadThemeId(): string {
  try {
    return getTheme(localStorage.getItem(KEY) ?? "").id;
  } catch {
    return THEMES[0].id;
  }
}

export function saveThemeId(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Storage unavailable; the theme just won't persist.
  }
}
