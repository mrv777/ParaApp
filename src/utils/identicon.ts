/**
 * Block-glyph identicon — a deterministic 5×5 pixel-block avatar derived from a
 * sender's address, per the Chat design handoff.
 *
 * The hash + PRNG + cell rules are ported verbatim from the design reference so
 * the same address always renders the same shape and hue. Colors are specified
 * in OKLCH (`oklch(L 0.14 hue)`); React Native has no OKLCH parser, so we
 * convert to sRGB here (Björn Ottosson's OKLab → linear sRGB, then gamma).
 *
 * IMPORTANT: the seed is the sender's *full address*, never the truncated handle
 * or nickname — the glyph must be stable and unique per account. The current
 * user's own glyph is grayscale (chroma 0); everyone else keeps their hue.
 */

/** Chroma for other members' glyphs ("vivid" tint from the handoff). */
const GLYPH_CHROMA = 0.14;
/** 5 × 5 grid. */
const CELL_COUNT = 25;

/** A single grid cell: an sRGB color string, or null when transparent. */
export type GlyphCell = string | null;

/** oklch(L C H) → `rgb(r,g,b)` (sRGB, 0–255). H in degrees. */
function oklchToRgb(L: number, C: number, hueDeg: number): string {
  const h = (hueDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const gamma = (v: number): number => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(1, c));
  };

  const r = Math.round(gamma(lr) * 255);
  const g = Math.round(gamma(lg) * 255);
  const bl = Math.round(gamma(lb) * 255);
  return `rgb(${r},${g},${bl})`;
}

/**
 * Generate the 25 cells for a seed. `self` → grayscale (chroma 0). Cells are NOT
 * mirrored: the raw PRNG sequence fills left-to-right, top-to-bottom.
 */
function computeCells(seed: string, self: boolean): GlyphCell[] {
  // Reference hash (design handoff).
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 40503 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  const chroma = self ? 0 : GLYPH_CHROMA;

  // Seeded LCG, stepped once per cell.
  let s = h || 7;
  const rnd = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const cells: GlyphCell[] = new Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i++) {
    const a = rnd();
    if (a < 0.28) {
      cells[i] = null; // transparent
    } else {
      const L = 0.42 + a * 0.44; // ~0.42–0.86
      cells[i] = oklchToRgb(L, chroma, hue);
    }
  }
  return cells;
}

// Pure function of (seed, self) — memoize per address so a scrolling feed
// doesn't recompute the same glyph on every render.
const cache = new Map<string, GlyphCell[]>();

/**
 * Cells for a sender's block glyph. `seed` MUST be the full account address.
 * `self` renders the current user's grayscale variant.
 */
export function glyphCells(seed: string, self: boolean): GlyphCell[] {
  const key = `${self ? '1' : '0'}|${seed}`;
  let cells = cache.get(key);
  if (!cells) {
    cells = computeCells(seed, self);
    cache.set(key, cells);
  }
  return cells;
}
