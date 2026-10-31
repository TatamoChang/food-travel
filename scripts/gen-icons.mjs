// Generates the comic-style item icons in src/assets/icons/ and theme backdrops in src/assets/themes/ (run: npm run icons).
// Shared rules keep the set consistent: thick dark outline, flat fill with one hard
// cel shadow (lower right), short white highlights, transparent background,
// and a yellow sparkle on final-tier and special dishes.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../src/assets/icons");
const O = "#1d1712";
let uid = 0;

// ---------- primitives ----------
const ell = (cx, cy, rx, ry) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`;
const line = (d, color = O, w = 3) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const flat = (d, fill, w = 3) =>
  `<path d="${d}" fill="${fill}" stroke="${O}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
const hl = (d) => line(d, "#ffffff", 3.5);
const dot = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const g = (transform, body) => `<g transform="${transform}">${body}</g>`;
/** Cel-shaded shape: shadow colour, base colour shifted up-left and clipped, then the outline. */
function cel(d, base, shade, { dx = -5, dy = -5, w = 5 } = {}) {
  const id = `c${uid++}`;
  return (
    `<clipPath id="${id}"><path d="${d}"/></clipPath>` +
    `<path d="${d}" fill="${shade}"/>` +
    `<g clip-path="url(#${id})"><path d="${d}" fill="${base}" transform="translate(${dx} ${dy})"/></g>` +
    `<path d="${d}" fill="none" stroke="${O}" stroke-width="${w}" stroke-linejoin="round"/>`
  );
}
/** Draw `body` clipped to shape `d` (for patterns on a surface). */
function clipped(d, body) {
  const id = `k${uid++}`;
  return `<clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})">${body}</g>`;
}
const sparkle = (x, y, s = 1) =>
  g(`translate(${x} ${y}) scale(${s})`, flat("M0 -12l3 9l9 3l-9 3l-3 9l-3 -9l-9 -3l9 -3z", "#ffe14d", 2.5));
const crystal = (x, y, s = 1, rot = 0) =>
  g(`translate(${x} ${y}) rotate(${rot}) scale(${s})`, flat("M-4 -4h8v8h-8z", "#f7fbff", 2) + line("M-2 -2l2 0", "#c5ced8", 1.5));
const leaf = (x, y, rot = 0, s = 1, fill = "#3fa34d") =>
  g(`translate(${x} ${y}) rotate(${rot}) scale(${s})`, flat("M-9 0q9 -10 18 0q-9 10 -18 0z", fill, 2.5) + line("M-6 0h11", "#9fdc8a", 1.5));

// ---------- pizza ----------
const crustDisc = (base = "#eeb05a", shade = "#c47f2c") => cel(ell(64, 74, 54, 36), base, shade);
const sauce = () => flat(ell(64, 71, 41, 25), "#d93a26", 3.5) + line("M34 80q30 18 60 0", "#a52617", 6) + line("M50 66q14 -8 28 0", "#ef6a4f", 3);
const pizzaB = () =>
  crustDisc() + flat(ell(64, 71, 41, 25), "#f6d79a", 3) + dot(50, 66, 2, "#c99a55") + dot(70, 62, 2, "#c99a55") + dot(78, 78, 2, "#c99a55") + dot(56, 80, 2, "#c99a55") + hl("M22 62q8 -14 26 -20");
const pizzaC = () => crustDisc() + sauce() + hl("M22 62q8 -14 26 -20");
const cheeseShreds = () =>
  [
    [44, 64, 20], [56, 72, -30], [68, 62, 40], [78, 74, -10], [52, 82, 60], [70, 84, 15], [86, 66, 70], [40, 76, -50], [62, 54, -15], [80, 56, 30],
  ]
    .map(([x, y, r]) => g(`translate(${x} ${y}) rotate(${r})`, line("M-6 0h12", O, 7) + line("M-6 0h12", "#ffe08a", 3.5)))
    .join("");
const pizzaD = () => crustDisc() + sauce() + cheeseShreds() + hl("M22 62q8 -14 26 -20");
const mozzarella = () =>
  flat("M40 62q8 -8 16 -2q6 6 -2 12q-10 6 -15 0q-4 -5 1 -10z", "#fff6e0") +
  flat("M70 70q9 -6 15 1q5 7 -3 12q-9 4 -13 -2q-3 -6 1 -11z", "#fff6e0") +
  flat("M48 78q6 -4 11 0q4 5 -2 9q-7 3 -10 -2q-2 -4 1 -7z", "#fff6e0") +
  flat("M70 52q6 -3 10 1q3 5 -2 8q-6 2 -9 -2q-2 -4 1 -7z", "#fff6e0");
const pizzaE = () =>
  crustDisc("#e39b3f", "#b06a22") + sauce() + mozzarella() + leaf(58, 66, -20, 1.1) + leaf(86, 64, 30) + leaf(60, 86, 10, 0.9) + hl("M22 62q8 -14 26 -20") + sparkle(108, 22);

// ---------- sushi ----------
const RICE = "#fffaf0";
const RICE_SH = "#e2dccf";
const grains = (pts) => pts.map(([x, y, r]) => g(`translate(${x} ${y}) rotate(${r})`, line("M-2.5 0h5", "#cfc6b4", 2))).join("");
function nigiri(fish = "#f4845f", fishSh = "#d9603c", stripe = "#ffd2bf") {
  const fishD = "M16 70q6 -28 48 -30q42 0 48 26q-4 10 -48 10q-42 0 -48 -6z";
  return (
    cel("M24 82q0 -14 40 -14q40 0 40 14q0 16 -40 16q-40 0 -40 -16z", RICE, RICE_SH) +
    grains([[40, 88, 20], [62, 92, -10], [84, 87, 30]]) +
    cel(fishD, fish, fishSh) +
    clipped(fishD, [30, 48, 66, 84].map((x) => line(`M${x} 78l14 -40`, stripe, 3)).join("")) +
    hl("M32 56q14 -10 30 -12")
  );
}
const board = () => cel("M8 80h112v18h-112z", "#c98a4b", "#9c6531") + flat("M18 98h14v10h-14z", "#9c6531", 4) + flat("M96 98h14v10h-14z", "#9c6531", 4) + line("M14 89h40", "#e0aa6e", 2.5);
const mini = (x, y, s, ...fish) => g(`translate(${x} ${y}) scale(${s})`, nigiri(...fish));
const TUNA = ["#d63a3a", "#a82424", "#f07a7a"];
const TAMAGO = ["#ffd34d", "#e0a82a", "#fff0a8"];
const sushiD = () => board() + mini(-4, 34, 0.5) + mini(32, 30, 0.5, ...TUNA) + mini(68, 34, 0.5, ...TAMAGO);

function onigiri(rice = RICE, riceSh = RICE_SH) {
  const tri = "M64 24q8 0 34 50q8 20 -12 24h-44q-20 -4 -12 -24q26 -50 34 -50z";
  return cel(tri, rice, riceSh) + grains([[56, 44, 10], [70, 50, -20], [50, 60, 40]]) + clipped(tri, flat("M44 74h40v40h-40z", "#2d3b2f", 3.5) + line("M50 80v20", "#4f6150", 2)) + line(tri, O, 5) + hl("M44 64q6 -16 14 -26");
}
const crown = (x, y, s = 1) => g(`translate(${x} ${y}) scale(${s})`, flat("M-14 6l-4 -16l10 8l8 -12l8 12l10 -8l-4 16z", "#ffd34d", 3) + dot(0, -14, 2.5, "#e0483a"));
const flame = (x, y, s = 1) => g(`translate(${x} ${y}) scale(${s})`, flat("M0 12q-12 -4 -8 -16q2 6 6 6q-4 -12 6 -20q-2 10 6 14q6 8 -2 14q-4 2 -8 2z", "#ff9a2e", 2.5) + flat("M1 10q-5 -2 -3 -8q3 3 5 2q2 4 -2 6z", "#ffe14d", 1.5));

// ---------- merge drops ----------
function coinFace(x, y, r) {
  return cel(ell(x, y, r, r), "#ffd34d", "#e0a82a", { w: Math.max(3, r / 7) }) + flat(ell(x, y, r * 0.62, r * 0.62), "none", Math.max(2, r / 12)) + line(`M${x} ${y - r * 0.35}v${r * 0.7}`, "#b07a1a", Math.max(2, r / 9));
}
const bolt = (x, y, s = 1) => g(`translate(${x} ${y}) scale(${s})`, cel("M8 -44l-34 50h24l-10 38l38 -54h-24z", "#ffe14d", "#f2b11c"));

// ---------- croissant ----------
function croissant(base, shade, x = 0, y = 0, s = 1) {
  const seg = (cx, cy, rx, ry, rot) => g(`rotate(${rot} ${cx} ${cy})`, cel(ell(cx, cy, rx, ry), base, shade, { w: 4.5 }));
  return g(
    `translate(${x} ${y}) scale(${s})`,
    seg(24, 82, 15, 9, -40) + seg(104, 82, 15, 9, 40) + seg(40, 68, 17, 14, -28) + seg(88, 68, 17, 14, 28) + seg(64, 60, 20, 20, 0) + hl("M54 50q6 -6 14 -6"),
  );
}
const RAW = ["#f6dfb0", "#dcbd85"];
const BAKED = ["#e8a043", "#b8691f"];

// ---------- seasonings ----------
function smallBowl(fill = "#5c8fc2", shade = "#3d6fa0") {
  return cel("M24 76h80q-4 30 -40 30q-36 0 -40 -30z", fill, shade) + flat(ell(64, 76, 40, 8), shade, 4);
}
const herbBundle = () =>
  line("M64 108l-18 -74", "#6b5a2e", 4) + line("M64 108l0 -80", "#6b5a2e", 4) + line("M64 108l18 -74", "#6b5a2e", 4) +
  leaf(50, 46, -60, 1.1, "#8a9a3c") + leaf(40, 60, -110, 1.1, "#8a9a3c") + leaf(64, 34, -90, 1.1, "#8a9a3c") + leaf(72, 52, -80, 1.1, "#8a9a3c") +
  leaf(80, 44, -120, 1.1, "#8a9a3c") + leaf(88, 62, -70, 1.1, "#8a9a3c") + leaf(56, 62, -100, 1, "#8a9a3c") +
  flat("M52 86h24v10h-24z", "#c9a06a", 3.5) + line("M58 86v10M70 86v10", "#9f7a45", 2);

// ---------- icon table ----------
const icons = {
  // generators
  gen_pizza: () =>
    cel("M34 46q-14 30 -8 52q4 12 38 12q34 0 38 -12q6 -22 -8 -52z", "#efe2c4", "#cdb98f") +
    flat("M38 48q6 -22 26 -14q20 -8 26 14z", "#efe2c4", 4.5) + line("M38 48q26 8 52 0", "#b5532c", 5) +
    line("M64 98v-36", "#a0742c", 3) + leaf(56, 72, -60, 0.9, "#e0a93b") + leaf(72, 72, -120, 0.9, "#e0a93b") + leaf(57, 84, -60, 0.9, "#e0a93b") + leaf(71, 84, -120, 0.9, "#e0a93b") + leaf(64, 62, -90, 0.9, "#e0a93b") +
    hl("M36 70q0 -10 4 -18"),
  gen_sushi: () =>
    cel("M28 50q-6 26 0 52q36 10 72 0q6 -26 0 -52q-36 -10 -72 0z", "#c98a4b", "#9c6531") +
    line("M28 62q36 10 72 0", "#5b4a3a", 5) + line("M28 90q36 10 72 0", "#5b4a3a", 5) +
    flat("M30 50q34 -34 68 0q-34 10 -68 0z", RICE, 4.5) + grains([[48, 42, 10], [62, 36, -20], [76, 42, 30]]) +
    g("rotate(25 92 36)", flat("M88 4h8v30h-8z", "#e6c68e", 3.5) + flat(ell(92, 40, 9, 11), "#e6c68e", 3.5)) +
    hl("M34 70q-2 10 0 20"),
  gen_croissant: () =>
    cel("M24 56h80v48h-80z", "#fff1a8", "#e6cf63") + flat("M24 72h80v12h-80z", "#3d6fb5", 4) +
    flat("M32 56l10 -22h44l10 22z", "#fff8d0", 4.5) + cel("M44 52l6 -12h28l6 12z", "#ffe27a", "#e9bf3f", { w: 3.5 }) +
    hl("M30 92v6"),
  gen_salt: () =>
    cel("M40 56q-6 28 0 52q24 8 48 0q6 -24 0 -52z", "#e6f0f7", "#bccfdd") +
    clipped("M40 56q-6 28 0 52q24 8 48 0q6 -24 0 -52z", `<path d="M30 84h70v40h-70z" fill="#ffffff"/>` + line("M30 84h70", "#c5ced8", 2.5)) +
    cel("M38 58q0 -28 26 -30q26 2 26 30z", "#aab6c2", "#7d8a97") + dot(56, 42, 2.5, O) + dot(64, 38, 2.5, O) + dot(72, 42, 2.5, O) +
    hl("M46 64q-3 14 0 30"),
  gen_spice: () =>
    cel("M34 46h60q6 0 6 6v50q0 6 -6 6h-60q-6 0 -6 -6v-50q0 -6 6 -6z", "#b5532c", "#8a3a1c") +
    flat("M38 62h52v30h-52z", "#fff1d6", 3.5) + leaf(64, 77, -30, 1.2, "#8a9a3c") +
    cel("M42 46v-18h44v18z", "#c9a06a", "#9f7a45", { w: 4.5 }) + line("M48 34h32", "#9f7a45", 2.5) +
    hl("M36 54v40"),

  // pizza
  pizza_a: () =>
    cel(ell(64, 76, 42, 30), "#f6e2b8", "#dcbf86") + line("M44 72q8 -6 16 -2", "#dcbf86", 3) +
    dot(46, 60, 2.5, "#ffffff") + dot(78, 58, 2, "#ffffff") + dot(84, 70, 2.5, "#ffffff") + dot(30, 104, 3, "#efe6d6") + dot(98, 106, 3, "#efe6d6") + dot(108, 100, 2, "#efe6d6") +
    hl("M36 66q6 -14 22 -18"),
  pizza_b: pizzaB,
  pizza_c: pizzaC,
  pizza_d: pizzaD,
  pizza_e: pizzaE,

  // sushi
  sushi_a: () =>
    flat("M26 66q38 -46 76 0z", RICE, 4.5) + grains([[46, 54, 20], [62, 46, -10], [78, 54, 30], [56, 60, 70], [70, 60, -40]]) +
    cel("M20 66h88q-4 38 -44 38q-40 0 -44 -38z", "#3d6fb5", "#2a4f88") + line("M34 84q8 -6 16 0q8 6 16 0q8 -6 16 0q8 6 16 0", "#9fc3e8", 3) +
    flat("M50 104h28v8h-28z", "#2a4f88", 4) + hl("M28 76q2 10 8 16"),
  sushi_b: () => onigiri(),
  sushi_c: () => nigiri(),
  sushi_d: sushiD,
  sushi_e: () =>
    g("translate(60 4)", line("M0 70v-56", O, 5) + flat("M2 16l26 12l-26 12z", "#d93a26", 3.5)) +
    cel("M6 74h116q-2 14 -12 30h-92q-10 -16 -12 -30z", "#c98a4b", "#9c6531") + flat("M2 74q-2 -14 10 -20l6 20z", "#c98a4b", 4) + flat("M126 74q2 -14 -10 -20l-6 20z", "#c98a4b", 4) +
    line("M16 88h96", "#9c6531", 3) + mini(-4, 30, 0.5) + mini(28, 26, 0.5, ...TUNA) + mini(60, 30, 0.5, ...TAMAGO) + sparkle(110, 20),

  // croissant
  croissant_a: () =>
    flat("M30 54l34 -14l34 14l-34 14z", "#fff2a6", 4.5) + flat("M30 54v28l34 14v-28z", "#ffe27a", 4.5) + flat("M98 54v28l-34 14v-28z", "#e9bf3f", 4.5) +
    flat("M22 84l42 18l42 -18l-10 -4l-32 14l-32 -14z", "#c5ced8", 3.5) + hl("M40 54l20 -8"),
  croissant_b: () => {
    const slab = "M20 60q0 -14 14 -14h60q14 0 14 14v18q0 14 -14 14h-60q-14 0 -14 -14z";
    return cel(slab, "#f6e4c0", "#dcc396") + line("M26 74h76M26 82h76", "#c9a873", 2.5) + flat("M84 46h10q14 0 14 14v8z", "#e9d2a6", 3.5) + hl("M30 56h30");
  },
  croissant_c: () => croissant(...RAW, 0, 6),
  croissant_d: () => croissant(...BAKED, 0, 6) + line("M58 58l-4 14M70 58l4 14", "#b8691f", 2.5) + dot(20, 104, 2.5, "#e8a043") + dot(110, 102, 2, "#e8a043"),
  croissant_e: () =>
    cel(ell(64, 86, 58, 24), "#ffffff", "#d9dde3") + flat(ell(64, 84, 42, 15), "#eef1f5", 2.5) +
    croissant(...BAKED, -6, 18, 0.72) + flat("M78 78q4 -14 18 -12q16 4 12 16q-6 10 -20 8q-12 -2 -10 -12z", "#ffffff", 3.5) + flat(ell(92, 76, 6, 6), "#ffb52e", 3) + sparkle(110, 26),

  // salt
  salt_1: () =>
    [[44, 94, 1.6, 10], [64, 98, 1.7, -15], [84, 94, 1.6, 25], [54, 80, 1.6, -30], [74, 80, 1.6, 15], [64, 66, 1.6, 40], [34, 104, 1.2, 0], [94, 104, 1.2, 30]]
      .map(([x, y, s, r]) => crystal(x, y, s, r)).join(""),
  salt_2: () =>
    smallBowl() + flat("M30 76q34 -44 68 0z", "#ffffff", 4) + [[50, 66], [60, 58], [70, 64], [78, 70], [46, 72], [64, 70], [56, 68]].map(([x, y]) => dot(x, y, 1.6, "#b7c3cf")).join("") + hl("M28 84q4 10 10 14"),
  salt_3: () =>
    cel("M18 80q46 -16 92 0q-6 28 -46 28q-40 0 -46 -28z", "#f7b6a8", "#e08b7a") + line("M40 84l8 20M64 82v24M88 84l-8 20", "#e08b7a", 3) +
    flat("M30 80q34 -30 68 0z", "#ffffff", 4) + crystal(50, 70, 1.3, 20) + crystal(66, 62, 1.4, -10) + crystal(80, 72, 1.2, 35) + sparkle(104, 34),

  // spice
  spice_1: herbBundle,
  spice_2: () => {
    const mound = "M28 76q36 -50 72 0z";
    return smallBowl("#a8683a", "#7b4a26") + clipped(mound, `<path d="M20 20h36v70h-36z" fill="#d9482b"/><path d="M56 20h18v70h-18z" fill="#f08a24"/><path d="M74 20h40v70h-40z" fill="#f2c230"/>`) + line(mound, O, 4) + hl("M28 84q4 10 10 14");
  },
  spice_3: () =>
    g("rotate(-35 86 40)", cel("M80 4h12v60h-12z", "#a7a9b3", "#7c7e89", { w: 4 })) +
    cel("M20 64h88q-2 40 -44 40q-42 0 -44 -40z", "#8d8f99", "#6b6d78") + flat(ell(64, 64, 44, 10), "#b0324a", 4) + line("M40 62q24 -8 48 0", "#e05673", 3) +
    flat("M46 104h36v8h-36z", "#6b6d78", 4) + sparkle(26, 34, 0.8) + sparkle(108, 70, 0.7),

  // special dishes (dish + seasoning accent + sparkle)
  special_pizza_spiced: () => pizzaC() + leaf(48, 66, 30, 0.6) + leaf(76, 62, -20, 0.6) + leaf(66, 82, 60, 0.6) + dot(56, 76, 2.2, "#7a1a10") + dot(84, 76, 2.2, "#7a1a10") + dot(44, 78, 2, "#7a1a10") + dot(70, 58, 2, "#7a1a10") + sparkle(108, 26),
  special_pizza_secret: () =>
    crustDisc("#e39b3f", "#b06a22") + sauce() + flat("M34 72q8 -16 30 -14q24 -2 30 12q-4 14 -30 14q-26 0 -30 -12z", "#ffd76a", 3.5) +
    dot(50, 68, 2.4, "#f08a24") + dot(64, 64, 2.4, "#b0324a") + dot(78, 70, 2.4, "#f08a24") + dot(58, 76, 2.4, "#b0324a") + dot(72, 78, 2.4, "#d9482b") +
    g("translate(96 40) rotate(-30)", flat("M-12 0q12 -8 22 0q-10 8 -22 0z", "#d93a26", 3) + line("M10 0l6 -4", "#3fa34d", 3)) + sparkle(22, 24),
  special_sushi_salted: () => nigiri("#f08a5d", "#c9592f", "#ffd2bf") + line("M34 56l10 -6M54 50l12 -4M76 48l12 2", "#6b2a12", 4) + crystal(44, 46, 0.9, 10) + crystal(70, 40, 0.9, -20) + crystal(90, 50, 0.9, 30) + sparkle(110, 22),
  special_sushi_platter: () => sushiD() + crystal(22, 56, 0.9, 20) + crystal(58, 52, 0.9, -10) + crystal(94, 56, 0.9, 30) + crystal(40, 48, 0.8, 0) + sparkle(110, 22),
  special_croissant_salted: () => croissant("#eeb459", "#c07a2a", 0, 6) + crystal(52, 54, 0.9, 20) + crystal(66, 48, 1, -15) + crystal(78, 58, 0.9, 35) + crystal(40, 66, 0.8, 0) + crystal(88, 68, 0.8, 10) + sparkle(110, 24),
  special_croissant_herb: () => croissant(...BAKED, 0, 10) + cel("M52 50l12 -8l14 6l-12 8z", "#ffe27a", "#e9bf3f", { w: 3 }) + leaf(40, 64, -30, 0.7) + leaf(88, 64, 30, 0.7) + leaf(64, 74, 0, 0.6) + sparkle(110, 24),

  // special recipes (green / orange / red)
  special_onigiri_salted: () => onigiri("#f2c27a", "#c98f45") + line("M48 50l30 0M44 60l40 0", "#8a5a24", 3) + crystal(54, 40, 0.8, 10) + crystal(70, 46, 0.8, -20) + crystal(62, 30, 0.7, 30) + sparkle(106, 24),
  special_breadstick_herb: () =>
    [[-28, 0], [0, 8], [28, 16]].map(([rot, dy]) => g(`rotate(${rot} 64 ${66 + dy})`, cel(`M14 ${66 + dy}q0 -7 7 -7h86q7 0 7 7q0 7 -7 7h-86q-7 0 -7 -7z`, "#eeb05a", "#c47f2c", { w: 4 }))).join("") +
    leaf(44, 52, 20, 0.5) + leaf(70, 66, -30, 0.5) + leaf(88, 84, 40, 0.5) + dot(56, 76, 2, "#3fa34d") + dot(80, 58, 2, "#3fa34d") + sparkle(108, 24),
  special_pastry_salted: () =>
    cel("M24 50h80l-6 50h-68z", "#f0b85e", "#c88a32") + line("M27 64h74M28 76h72M29 88h70", "#c88a32", 2.5) +
    cel("M48 46l16 -8l18 6l-16 8z", "#ffe27a", "#e9bf3f", { w: 3 }) + crystal(40, 58, 0.8, 15) + crystal(86, 56, 0.8, -15) + crystal(64, 66, 0.7, 30) + sparkle(108, 26),
  special_onigiri_spiced: () => onigiri() + dot(56, 42, 2.5, "#d9482b") + dot(66, 50, 2.5, "#f08a24") + dot(52, 58, 2.5, "#d9482b") + dot(74, 60, 2.5, "#f2c230") + dot(62, 36, 2, "#f08a24") + leaf(80, 40, 40, 0.6) + sparkle(106, 24),
  special_sushi_seared: () => nigiri("#f08a5d", "#c9592f", "#ffd2bf") + line("M34 56l10 -6M54 50l12 -4M76 48l12 2", "#6b2a12", 4) + dot(46, 52, 2.2, "#d9482b") + dot(64, 46, 2.2, "#f2c230") + dot(84, 50, 2.2, "#f08a24") + flame(102, 36, 1) + sparkle(22, 30, 0.8),
  special_pizza_truffle: () => pizzaE() + [[50, 60], [76, 78], [62, 72], [84, 60]].map(([x, y]) => flat(ell(x, y, 5, 4), "#4a3426", 2) + dot(x - 1, y - 1, 1.2, "#8a6a52")).join(""),
  special_croissant_tart: () =>
    flat("M30 100h68l-8 10h-52z", "#d9dde3", 4) + flat("M58 100v-8h12v8z", "#d9dde3", 3.5) + cel(ell(64, 90, 46, 10), "#ffffff", "#d9dde3", { w: 4 }) +
    croissant("#ffcf3f", "#d99a1a", 4, 4, 0.9) + crown(64, 30, 0.9) + sparkle(110, 30) + sparkle(18, 50, 0.7),
  special_sushi_emperor: () =>
    cel("M6 78h116q-2 14 -12 30h-92q-10 -16 -12 -30z", "#ffd34d", "#d99a1a") + flat("M2 78q-2 -14 10 -20l6 20z", "#ffd34d", 4) + flat("M126 78q2 -14 -10 -20l-6 20z", "#ffd34d", 4) +
    line("M16 92h96", "#d99a1a", 3) + dot(40, 98, 3, "#e0483a") + dot(64, 98, 3, "#3d6fb5") + dot(88, 98, 3, "#e0483a") +
    mini(-4, 34, 0.5) + mini(28, 30, 0.5, ...TUNA) + mini(60, 34, 0.5, ...TAMAGO) + crown(64, 24, 1.1) + sparkle(110, 18) + sparkle(18, 22, 0.7),

  // merge drops: coins and energy (tap to collect)
  coin_1: () => coinFace(64, 70, 34) + sparkle(100, 30, 0.8),
  coin_2: () =>
    cel("M30 66q-8 40 34 44q42 -4 34 -44q-8 -14 -34 -14q-26 0 -34 14z", "#c98a4b", "#9c6531") +
    flat("M44 54q-4 -18 8 -20l12 8l12 -8q12 2 8 20z", "#c98a4b", 4) + line("M44 54q20 8 40 0", "#5b4a3a", 5) +
    coinFace(64, 82, 16) + coinFace(40, 40, 12) + hl("M36 76q-2 12 4 20"),
  coin_3: () =>
    cel("M16 64h96v42h-96z", "#a8683a", "#7b4a26") + line("M16 78h96", "#5b4a3a", 4) + flat("M58 70h12v14h-12z", "#ffd34d", 3) +
    flat("M20 64q0 -14 14 -16h60q14 2 14 16z", "#f2c230", 4) +
    coinFace(40, 48, 12) + coinFace(64, 42, 13) + coinFace(88, 48, 12) + coinFace(52, 32, 10) + coinFace(76, 32, 10) + sparkle(108, 22) + sparkle(20, 30, 0.7),
  energy_1: () => bolt(64, 66, 1) + sparkle(98, 30, 0.7),
  energy_2: () =>
    cel(ell(64, 66, 40, 40), "#7fd8f7", "#3fa6d4") + clipped(ell(64, 66, 40, 40), dot(52, 50, 14, "#b6ecfb")) + line(ell(64, 66, 40, 40), O, 5) + bolt(64, 66, 0.7) + hl("M38 52q4 -10 14 -16"),
  energy_3: () =>
    cel("M64 10l34 24v52l-34 30l-34 -30v-52z", "#7fd8f7", "#3fa6d4") + line("M64 10v106M30 34l34 24l34 -24", "#3fa6d4", 3) + bolt(64, 66, 0.7) + hl("M40 40v30") + sparkle(108, 22) + sparkle(18, 92, 0.7),
};

// ---------- theme backdrops (360x720, same comic rules) ----------
const THEME_OUT = join(dirname(fileURLToPath(import.meta.url)), "../src/assets/themes");
const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;
const bands = (colors) => colors.map(([y, c]) => `<path d="${rect(0, y, 360, 720 - y)}" fill="${c}"/>`).join("");
const stars = (pts) => pts.map(([x, y, r]) => dot(x, y, r, "#fff4cf")).join("");
const cloud = (x, y, s, fill = "#ffffff") => g(`translate(${x} ${y}) scale(${s})`, flat("M-30 10q-14 0 -12 -12q2 -12 16 -10q4 -16 22 -14q16 2 18 14q16 -2 18 10q0 12 -14 12z", fill, 3));
const windows = (x, y, w, h, color, step = 12) => {
  let out = "";
  for (let wy = y + 8; wy < y + h - 6; wy += step) for (let wx = x + 6; wx < x + w - 6; wx += 10) out += `<path d="${rect(wx, wy, 4, 5)}" fill="${color}"/>`;
  return out;
};

const backdrops = {
  taipei: () => {
    const floors = Array.from({ length: 8 }, (_, i) => {
      const yb = 640 - i * 40;
      return cel(`M158 ${yb}L150 ${yb - 40}H210L202 ${yb}z`, "#4fb3a5", "#2f8a7e", { w: 4 }) + line(`M160 ${yb - 14}h40M158 ${yb - 26}h44`, "#2f8a7e", 2);
    }).join("");
    const lanterns = [40, 110, 250, 320].map((x, i) => {
      const y = 312 + (i % 2) * 14;
      return line(`M${x} ${y - 14}v8`, O, 2) + cel(ell(x, y + 8, 12, 14), "#e0483a", "#a8282a", { w: 3 }) + flat(rect(x - 6, y - 7, 12, 4), "#ffd34d", 2) + flat(rect(x - 6, y + 21, 12, 4), "#ffd34d", 2) + line(`M${x} ${y + 25}v10`, "#ffd34d", 2);
    }).join("");
    return (
      bands([[0, "#241a40"], [300, "#33214d"], [460, "#5a2a5a"], [560, "#9a3c52"], [630, "#d9704a"]]) +
      stars([[30, 60, 2], [90, 30, 1.5], [150, 70, 2], [230, 40, 1.5], [330, 150, 2], [60, 190, 1.5], [280, 220, 2]]) +
      cel(ell(300, 90, 26, 26), "#ffe9a8", "#e9c870", { w: 4 }) +
      cel("M0 640q60 -70 120 -24q50 -56 110 -4q60 -52 130 -12V720H0z", "#3a2346", "#2a1834", { w: 4 }) +
      line("M180 320V220", O, 6) + line("M180 320V222", "#9fe0d6", 2.5) +
      cel("M170 330l-4 -10h28l-4 10z", "#4fb3a5", "#2f8a7e", { w: 4 }) + floors +
      cel(rect(140, 640, 80, 60), "#3f9488", "#2a6f66", { w: 4 }) + windows(140, 640, 80, 60, "#ffe9a8", 14) +
      line("M0 304q90 30 180 0q90 30 180 0", O, 2.5) + lanterns +
      `<path d="${rect(0, 700, 360, 20)}" fill="#2a1a2e"/>`
    );
  },
  newyork: () => {
    const back = [[0, 560, 40], [36, 600, 34], [66, 520, 44], [100, 590, 36], [226, 580, 40], [262, 540, 30], [330, 600, 30]]
      .map(([x, y, w]) => cel(rect(x, y, w, 720 - y), "#5b7290", "#46597a", { w: 3 }) + windows(x, y, w, 720 - y, "#ffe08a", 14)).join("");
    return (
      bands([[0, "#2f5f9a"], [200, "#4f86c0"], [400, "#8fc0e0"], [560, "#f2d39a"]]) +
      cloud(70, 120, 1.2) + cloud(270, 210, 1) + cloud(160, 60, 0.8) +
      back +
      line("M180 300V220", O, 5) + line("M180 300V222", "#c5ced8", 2) +
      cel(rect(170, 300, 20, 40), "#a7b6c8", "#7d8ea4", { w: 4 }) +
      cel(rect(158, 340, 44, 90), "#a7b6c8", "#7d8ea4", { w: 4 }) + windows(158, 340, 44, 90, "#ffe08a") +
      cel(rect(146, 430, 68, 110), "#9aaabe", "#74859c", { w: 4 }) + windows(146, 430, 68, 110, "#ffe08a") +
      cel(rect(132, 540, 96, 160), "#8a9bb0", "#64748a", { w: 4 }) + windows(132, 540, 96, 160, "#ffe08a") +
      // Statue of Liberty (right)
      cel(rect(282, 630, 40, 70), "#9aaabe", "#74859c", { w: 4 }) +
      cel("M290 630l6 -100h12l6 100z", "#5fa88f", "#3f8a72", { w: 4 }) +
      cel(ell(302, 522, 9, 9), "#5fa88f", "#3f8a72", { w: 3 }) + line("M294 512l-4 -8M302 510v-9M310 512l4 -8", "#3f8a72", 3) +
      line("M308 548l14 -64", O, 7) + line("M308 548l14 -64", "#5fa88f", 4) +
      flat("M316 484l6 -6l6 6z", "#5fa88f", 2.5) + flat("M322 476q-8 -10 0 -20q8 10 0 20z", "#ffd34d", 2.5) +
      `<path d="${rect(0, 700, 360, 20)}" fill="#3a3a3a"/>` + line("M10 710h30M70 710h30M130 710h30M190 710h30M250 710h30M310 710h30", "#f2c230", 3)
    );
  },
  paris: () => {
    const roofs = [[0, 600, 60], [56, 630, 50], [262, 620, 50], [306, 590, 54]]
      .map(([x, y, w]) => cel(rect(x, y + 16, w, 700 - y - 16), "#e8dcc8", "#c9b89c", { w: 3 }) + cel(`M${x} ${y + 16}l8 -16h${w - 16}l8 16z`, "#7d8fb0", "#5d6f90", { w: 3 }) + windows(x, y + 16, w, 700 - y - 16, "#8fa3c4", 16)).join("");
    return (
      bands([[0, "#5c4d82"], [180, "#8a74a8"], [360, "#d8a0bc"], [540, "#f6cdb8"]]) +
      cloud(60, 110, 1.1, "#fbe8f0") + cloud(290, 70, 0.9, "#fbe8f0") + cloud(300, 300, 1, "#fbe8f0") +
      roofs +
      cel("M112 700Q152 560 166 420L175 262L180 236L185 262L194 420Q208 560 248 700H220Q198 626 180 614Q162 626 140 700z", "#2d3a5c", "#1d2740", { w: 4 }) +
      line("M128 640l104 0M150 520l60 0M162 420h36M170 330h20", "#4a5a80", 3) +
      flat(rect(132, 596, 96, 10), "#3d4b72", 3.5) + flat(rect(156, 414, 48, 8), "#3d4b72", 3) + flat(rect(170, 326, 20, 6), "#3d4b72", 2.5) +
      line("M146 600l20 -170M214 600l-20 -170M150 520l40 -90M210 520l-40 -90", "#4a5a80", 2) +
      `<path d="${rect(0, 690, 360, 30)}" fill="#6fa8d6"/>` + line("M0 690h360", O, 3) + line("M20 704q10 -6 20 0M90 708q10 -6 20 0M170 702q10 -6 20 0M250 708q10 -6 20 0M320 704q10 -6 20 0", "#d6ecf8", 2.5)
    );
  },
};

mkdirSync(THEME_OUT, { recursive: true });
for (const [id, draw] of Object.entries(backdrops)) {
  uid = 0;
  writeFileSync(join(THEME_OUT, `${id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 720">${draw()}</svg>\n`);
}

mkdirSync(OUT, { recursive: true });
for (const [id, draw] of Object.entries(icons)) {
  uid = 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${draw()}</svg>\n`;
  writeFileSync(join(OUT, `${id}.svg`), svg);
}
console.log(`wrote ${Object.keys(icons).length} icons to ${OUT}`);
