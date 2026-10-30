import { Sprite, Texture } from "pixi.js";

/** Rasterized size of each icon; drawn smaller on screen so it stays sharp on high-DPI phones. */
const ICON_PX = 192;

const sources = import.meta.glob("../assets/icons/*.svg", { eager: true, query: "?raw", import: "default" }) as Record<string, string>;
const textures = new Map<string, Texture>();

function rasterize(svg: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = ICON_PX;
      canvas.getContext("2d")!.drawImage(img, 0, 0, ICON_PX, ICON_PX);
      resolve(Texture.from(canvas));
    };
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** Load every icon in src/assets/icons (file name = item id). Call once before drawing. */
export async function loadIcons() {
  await Promise.all(
    Object.entries(sources).map(async ([path, svg]) => {
      const id = path.slice(path.lastIndexOf("/") + 1, -".svg".length);
      textures.set(id, await rasterize(svg));
    }),
  );
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
