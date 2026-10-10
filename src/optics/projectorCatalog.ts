/**
 * Projector bodies and lenses for previz.
 *
 * Panasonic, Epson and Optoma come from the researched table
 * (tools/catalog/projector-lenses.csv → src/optics/data/catalogData.json, rebuilt with
 * `node tools/catalog/build-catalog.mjs`). Each lens row was checked against the maker's
 * spec sheets; `verified` says how that went. Throw ratios are per projector + lens,
 * because the same lens throws differently on different chip sizes.
 *
 * Barco, Christie, Sony and the generic bodies are typical published figures only.
 *
 * Lens shift is a fraction of the image (0.5 = half the image height / width), the same
 * unit as `ProjectorOptics.lensShiftH/V`. `null` means the sheet gives no usable range.
 */
import catalogData from './data/catalogData.json';

export type CatalogVerification = 'yes' | 'conflict' | 'no';

export interface CatalogLens {
  id: string;
  name: string;
  throwMin: number;
  throwMax: number;
  /** [down, up] vertical shift as a fraction of image height; null when unknown. */
  shiftV: [number, number] | null;
  /** [left, right] horizontal shift as a fraction of image width; null when unknown. */
  shiftH: [number, number] | null;
  /** Researched rows only: how the row checked out against the maker's sheets. */
  verified?: CatalogVerification | null;
  source?: string | null;
}

export interface CatalogProjector {
  id: string;
  brand: string;
  model: string;
  /** Rated brightness; null when the maker publishes no figure we could find. */
  lumens: number | null;
  /** ANSI, ISO 21118, or not stated by the maker. Approximate entries leave it out. */
  lumensStandard?: 'ANSI' | 'ISO' | 'unstated' | null;
  resolution: { width: number; height: number };
  discontinued?: boolean;
  /** True for the hand-entered typical figures (not from the researched table). */
  approximate?: boolean;
  lenses: CatalogLens[];
}

const sym = (v: number): [number, number] => [-v, v];

/** Barco TLD+ lens family (UDX / HDX / F90). */
const BARCO_TLD: CatalogLens[] = [
  { id: 'tld-0.37', name: 'TLD+ 0.37 UST', throwMin: 0.37, throwMax: 0.37, shiftV: sym(0), shiftH: sym(0) },
  { id: 'tld-0.65', name: 'TLD+ 0.65–0.85', throwMin: 0.65, throwMax: 0.85, shiftV: sym(0.3), shiftH: sym(0.2) },
  { id: 'tld-0.8', name: 'TLD+ 0.8–1.16', throwMin: 0.8, throwMax: 1.16, shiftV: sym(0.6), shiftH: sym(0.3) },
  { id: 'tld-1.16', name: 'TLD+ 1.16–1.5', throwMin: 1.16, throwMax: 1.5, shiftV: sym(1.0), shiftH: sym(0.4) },
  { id: 'tld-1.5', name: 'TLD+ 1.5–2.0', throwMin: 1.5, throwMax: 2.0, shiftV: sym(1.0), shiftH: sym(0.4) },
  { id: 'tld-2.0', name: 'TLD+ 2.0–2.8', throwMin: 2.0, throwMax: 2.8, shiftV: sym(1.0), shiftH: sym(0.4) },
  { id: 'tld-2.8', name: 'TLD+ 2.8–4.5', throwMin: 2.8, throwMax: 4.5, shiftV: sym(1.0), shiftH: sym(0.4) },
  { id: 'tld-4.5', name: 'TLD+ 4.5–7.5', throwMin: 4.5, throwMax: 7.5, shiftV: sym(1.0), shiftH: sym(0.4) },
];

/** Christie M / D series lens family (approximate). */
const CHRISTIE: CatalogLens[] = [
  { id: 'ch-0.38', name: '0.38 UST', throwMin: 0.38, throwMax: 0.38, shiftV: sym(0), shiftH: sym(0) },
  { id: 'ch-0.84', name: '0.84–1.02', throwMin: 0.84, throwMax: 1.02, shiftV: sym(0.3), shiftH: sym(0.15) },
  { id: 'ch-1.13', name: '1.13–1.31', throwMin: 1.13, throwMax: 1.31, shiftV: sym(0.5), shiftH: sym(0.25) },
  { id: 'ch-1.45', name: '1.45–1.94', throwMin: 1.45, throwMax: 1.94, shiftV: sym(0.5), shiftH: sym(0.25) },
  { id: 'ch-1.94', name: '1.94–2.80', throwMin: 1.94, throwMax: 2.8, shiftV: sym(0.5), shiftH: sym(0.25) },
  { id: 'ch-2.80', name: '2.80–4.50', throwMin: 2.8, throwMax: 4.5, shiftV: sym(0.5), shiftH: sym(0.25) },
];

const GENERIC_LENSES: CatalogLens[] = [
  { id: 'gen-short', name: 'Short 0.8–1.0', throwMin: 0.8, throwMax: 1.0, shiftV: sym(0.3), shiftH: sym(0.1) },
  { id: 'gen-std', name: 'Standard 1.4–2.0', throwMin: 1.4, throwMax: 2.0, shiftV: sym(0.5), shiftH: sym(0.2) },
  { id: 'gen-long', name: 'Long 2.0–4.0', throwMin: 2.0, throwMax: 4.0, shiftV: sym(0.5), shiftH: sym(0.2) },
];

const WUXGA = { width: 1920, height: 1200 };
const UHD = { width: 3840, height: 2160 };
const HD = { width: 1920, height: 1080 };

const APPROXIMATE: CatalogProjector[] = [
  { id: 'barco-udx-w22', brand: 'Barco', model: 'UDX-W22', lumens: 21000, resolution: WUXGA, lenses: BARCO_TLD },
  { id: 'barco-udx-4k32', brand: 'Barco', model: 'UDX-4K32', lumens: 31000, resolution: UHD, lenses: BARCO_TLD },
  { id: 'barco-g62-w11', brand: 'Barco', model: 'G62-W11', lumens: 11000, resolution: WUXGA, lenses: GENERIC_LENSES },
  { id: 'christie-d20wu-hs', brand: 'Christie', model: 'D20WU-HS', lumens: 20000, resolution: WUXGA, lenses: CHRISTIE },
  { id: 'christie-m4k25', brand: 'Christie', model: 'M 4K25 RGB', lumens: 25300, resolution: UHD, lenses: CHRISTIE },
  { id: 'sony-vpl-fhz90l', brand: 'Sony', model: 'VPL-FHZ90L', lumens: 9000, resolution: WUXGA, lenses: GENERIC_LENSES },
  { id: 'generic-5k-hd', brand: 'Generic', model: '5,000 lm 1080p', lumens: 5000, resolution: HD, lenses: GENERIC_LENSES },
  { id: 'generic-10k-wuxga', brand: 'Generic', model: '10,000 lm WUXGA', lumens: 10000, resolution: WUXGA, lenses: GENERIC_LENSES },
  { id: 'generic-20k-4k', brand: 'Generic', model: '20,000 lm 4K', lumens: 20000, resolution: UHD, lenses: GENERIC_LENSES },
].map((p) => ({ ...p, approximate: true }));

const RESEARCHED = (catalogData as { projectors: CatalogProjector[] }).projectors;

/** Date the researched table was last checked against the makers' sheets. */
export const CATALOG_CHECKED_ON: string | null = (catalogData as { checkedOn: string | null }).checkedOn;

export const PROJECTOR_CATALOG: CatalogProjector[] = [...RESEARCHED, ...APPROXIMATE];

/** Model ids saved by v5 projects, before the researched table replaced those entries. */
const LEGACY_MODEL_IDS: Record<string, string> = {
  'pana-pt-rz990': 'panasonic-pt-rz990',
  'pana-pt-rz21k': 'panasonic-pt-rz21k',
  'pana-pt-rq35k': 'panasonic-pt-rq35k2',
};
const LEGACY_LENS_IDS: Record<string, string> = {
  elplx02: 'elplx02s',
};

export const DEFAULT_PROJECTOR_LUMENS = 10000;

export function findCatalogProjector(id: string | undefined): CatalogProjector | undefined {
  if (!id) return undefined;
  const key = LEGACY_MODEL_IDS[id] ?? id;
  return PROJECTOR_CATALOG.find((p) => p.id === key);
}

export function findCatalogLens(
  projector: CatalogProjector | undefined,
  lensId: string | undefined,
): CatalogLens | undefined {
  if (!projector || !lensId) return undefined;
  const key = LEGACY_LENS_IDS[lensId] ?? lensId;
  return projector.lenses.find((l) => l.id === key);
}

/** Lens that best fits a throw ratio: one whose zoom range contains it, else the nearest. */
export function bestLensForThrow(projector: CatalogProjector, throwRatio: number): CatalogLens {
  const containing = projector.lenses.find((l) => throwRatio >= l.throwMin && throwRatio <= l.throwMax);
  if (containing) return containing;
  let best = projector.lenses[0];
  let bestGap = Infinity;
  for (const l of projector.lenses) {
    const gap = throwRatio < l.throwMin ? l.throwMin - throwRatio : throwRatio - l.throwMax;
    if (gap < bestGap) {
      best = l;
      bestGap = gap;
    }
  }
  return best;
}

export function clampThrow(lens: CatalogLens, throwRatio: number): number {
  return Math.min(lens.throwMax, Math.max(lens.throwMin, throwRatio));
}

export interface LensShiftCheck {
  ok: boolean;
  /** Human-readable problems, empty when ok. */
  issues: string[];
}

export function checkLensShift(lens: CatalogLens, shiftH: number, shiftV: number): LensShiftCheck {
  const issues: string[] = [];
  const eps = 1e-6;
  if (lens.shiftV && (shiftV < lens.shiftV[0] - eps || shiftV > lens.shiftV[1] + eps)) {
    issues.push(
      `Shift V ${pct(shiftV)} is outside this lens (${pct(lens.shiftV[0])} to ${pct(lens.shiftV[1])})`,
    );
  }
  if (lens.shiftH && (shiftH < lens.shiftH[0] - eps || shiftH > lens.shiftH[1] + eps)) {
    issues.push(
      `Shift H ${pct(shiftH)} is outside this lens (${pct(lens.shiftH[0])} to ${pct(lens.shiftH[1])})`,
    );
  }
  return { ok: issues.length === 0, issues };
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** Throw distance range (m) for an image `imageWidth` wide with this lens. */
export function throwDistanceRange(lens: CatalogLens, imageWidth: number): [number, number] {
  return [lens.throwMin * imageWidth, lens.throwMax * imageWidth];
}
