import { Sprite, Texture } from "pixi.js";

/** Rasterized size of each icon; drawn smaller on screen so it stays sharp on high-DPI phones. */
const ICON_PX = 192;

/** Theme backdrops are 360x720 and rasterized at 2x. */
const BACKDROP_SCALE = 2;

const sources = import.meta.glob("../assets/icons/*.svg", { eager: true, query: "?raw", import: "default" }) as Record<string, string>;
const backdropSources = import.meta.glob("../assets/themes/*.svg", { eager: true, query: "?raw", import: "default" }) as Record<string, string>;
const textures = new Map<string, Texture>();
const backdrops = new Map<string, Texture>();

const fileId = (path: string) => path.slice(path.lastIndexOf("/") + 1, -".svg".length);

function rasterize(svg: string, w = ICON_PX, h = ICON_PX): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(Texture.from(canvas));
    };
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** Load every icon in src/assets/icons (file name = item id) and theme backdrop in src/assets/themes. Call once before drawing. */
export async function loadIcons() {
  await Promise.all([
    ...Object.entries(sources).map(async ([path, svg]) => textures.set(fileId(path), await rasterize(svg))),
    ...Object.entries(backdropSources).map(async ([path, svg]) =>
      backdrops.set(fileId(path), await rasterize(svg, 360 * BACKDROP_SCALE, 720 * BACKDROP_SCALE)),
    ),
  ]);
}

/** Full-screen (360x720) backdrop sprite for a theme, or null when the theme has none. */
export function backdropSprite(themeId: string, x = 0, y = 0, scale = 1): Sprite | null {
  const tex = backdrops.get(themeId);
  if (!tex) return null;
  const s = new Sprite(tex);
  s.position.set(x, y);
  s.width = 360 * scale;
  s.height = 720 * scale;
  s.eventMode = "none";
  return s;
}

/** Non-interactive sprite of an item's icon, `size` px square, or null when the item has no icon. */
export function iconSprite(id: string, x: number, y: number, size: number): Sprite | null {
  const tex = textures.get(id);
  if (!tex) return null;
  const s = new Sprite(tex);
  s.position.set(x, y);
  s.width = s.height = size;
  s.eventMode = "none";
  return s;
}
