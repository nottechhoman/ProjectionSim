/**
 * v5 previz: a small catalogue of real projector bodies and lenses.
 *
 * Values are typical published figures (ANSI lumens, native resolution, zoom
 * range, lens-shift range). They are approximate — always check the
 * manufacturer's datasheet before ordering or hanging anything.
 *
 * Lens shift is a fraction of the image (0.5 = half the image height / width),
 * the same unit as `ProjectorOptics.lensShiftH/V`.
 */

export interface CatalogLens {
  id: string;
  name: string;
  throwMin: number;
  throwMax: number;
  /** [down, up] vertical shift as a fraction of image height. */
  shiftV: [number, number];
  /** [left, right] horizontal shift as a fraction of image width. */
  shiftH: [number, number];
}

export interface CatalogProjector {
  id: string;
  brand: string;
  model: string;
  lumens: number;
  resolution: { width: number; height: number };
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

/** Epson ELPL lens family (EB-L1000 / L1500 series). */
const EPSON_ELPL: CatalogLens[] = [
  { id: 'elplx02', name: 'ELPLX02 0.35 UST', throwMin: 0.35, throwMax: 0.35, shiftV: sym(0), shiftH: sym(0) },
  { id: 'elplu03s', name: 'ELPLU03S 0.65–0.78', throwMin: 0.65, throwMax: 0.78, shiftV: sym(0.5), shiftH: sym(0.18) },
  { id: 'elplw08', name: 'ELPLW08 1.04–1.40', throwMin: 1.04, throwMax: 1.4, shiftV: sym(0.67), shiftH: sym(0.3) },
  { id: 'elplm15', name: 'ELPLM15 1.44–2.32 (std)', throwMin: 1.44, throwMax: 2.32, shiftV: sym(0.67), shiftH: sym(0.3) },
  { id: 'elplm10', name: 'ELPLM10 2.22–3.61', throwMin: 2.22, throwMax: 3.61, shiftV: sym(0.67), shiftH: sym(0.3) },
  { id: 'elpll08', name: 'ELPLL08 3.89–7.48', throwMin: 3.89, throwMax: 7.48, shiftV: sym(0.67), shiftH: sym(0.3) },
];

/** Panasonic ET-D75LE lens family (RZ / RQ 1-chip and 3-chip large venue). */
const PANASONIC_D75: CatalogLens[] = [
  { id: 'et-d75le90', name: 'ET-D75LE90 0.36 UST', throwMin: 0.36, throwMax: 0.36, shiftV: sym(0), shiftH: sym(0) },
  { id: 'et-d75le95', name: 'ET-D75LE95 0.8–1.0', throwMin: 0.8, throwMax: 1.0, shiftV: sym(0.3), shiftH: sym(0.15) },
  { id: 'et-d75le6', name: 'ET-D75LE6 1.3–1.7', throwMin: 1.3, throwMax: 1.7, shiftV: sym(0.6), shiftH: sym(0.3) },
  { id: 'et-d75le10', name: 'ET-D75LE10 1.7–2.4 (std)', throwMin: 1.7, throwMax: 2.4, shiftV: sym(0.6), shiftH: sym(0.3) },
  { id: 'et-d75le20', name: 'ET-D75LE20 2.4–4.7', throwMin: 2.4, throwMax: 4.7, shiftV: sym(0.6), shiftH: sym(0.3) },
  { id: 'et-d75le30', name: 'ET-D75LE30 4.6–7.4', throwMin: 4.6, throwMax: 7.4, shiftV: sym(0.6), shiftH: sym(0.3) },
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

export const PROJECTOR_CATALOG: CatalogProjector[] = [
  { id: 'barco-udx-w22', brand: 'Barco', model: 'UDX-W22', lumens: 21000, resolution: WUXGA, lenses: BARCO_TLD },
  { id: 'barco-udx-4k32', brand: 'Barco', model: 'UDX-4K32', lumens: 31000, resolution: UHD, lenses: BARCO_TLD },
  { id: 'barco-g62-w11', brand: 'Barco', model: 'G62-W11', lumens: 11000, resolution: WUXGA, lenses: GENERIC_LENSES },
  { id: 'epson-eb-l1755u', brand: 'Epson', model: 'EB-L1755U', lumens: 15000, resolution: WUXGA, lenses: EPSON_ELPL },
  { id: 'epson-eb-l1505u', brand: 'Epson', model: 'EB-L1505U', lumens: 12000, resolution: WUXGA, lenses: EPSON_ELPL },
  { id: 'epson-eb-pu2220b', brand: 'Epson', model: 'EB-PU2220B', lumens: 20000, resolution: WUXGA, lenses: EPSON_ELPL },
  { id: 'pana-pt-rz990', brand: 'Panasonic', model: 'PT-RZ990', lumens: 10000, resolution: WUXGA, lenses: PANASONIC_D75 },
  { id: 'pana-pt-rz21k', brand: 'Panasonic', model: 'PT-RZ21K', lumens: 20000, resolution: WUXGA, lenses: PANASONIC_D75 },
  { id: 'pana-pt-rq35k', brand: 'Panasonic', model: 'PT-RQ35K', lumens: 30500, resolution: UHD, lenses: PANASONIC_D75 },
  { id: 'christie-d20wu-hs', brand: 'Christie', model: 'D20WU-HS', lumens: 20000, resolution: WUXGA, lenses: CHRISTIE },
  { id: 'christie-m4k25', brand: 'Christie', model: 'M 4K25 RGB', lumens: 25300, resolution: UHD, lenses: CHRISTIE },
  { id: 'sony-vpl-fhz90l', brand: 'Sony', model: 'VPL-FHZ90L', lumens: 9000, resolution: WUXGA, lenses: GENERIC_LENSES },
  { id: 'generic-5k-hd', brand: 'Generic', model: '5,000 lm 1080p', lumens: 5000, resolution: HD, lenses: GENERIC_LENSES },
  { id: 'generic-10k-wuxga', brand: 'Generic', model: '10,000 lm WUXGA', lumens: 10000, resolution: WUXGA, lenses: GENERIC_LENSES },
  { id: 'generic-20k-4k', brand: 'Generic', model: '20,000 lm 4K', lumens: 20000, resolution: UHD, lenses: GENERIC_LENSES },
];

export const DEFAULT_PROJECTOR_LUMENS = 10000;

export function findCatalogProjector(id: string | undefined): CatalogProjector | undefined {
  return id ? PROJECTOR_CATALOG.find((p) => p.id === id) : undefined;
}

export function findCatalogLens(
  projector: CatalogProjector | undefined,
  lensId: string | undefined,
): CatalogLens | undefined {
  return projector && lensId ? projector.lenses.find((l) => l.id === lensId) : undefined;
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
  if (shiftV < lens.shiftV[0] - eps || shiftV > lens.shiftV[1] + eps) {
    issues.push(
      `Shift V ${pct(shiftV)} is outside this lens (${pct(lens.shiftV[0])} to ${pct(lens.shiftV[1])})`,
    );
  }
  if (shiftH < lens.shiftH[0] - eps || shiftH > lens.shiftH[1] + eps) {
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
