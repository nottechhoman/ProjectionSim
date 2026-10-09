// Builds src/optics/data/catalogData.json from tools/catalog/projector-lenses.csv
// (the researched Panasonic / Epson / Optoma projector + lens table).
// Usage: node tools/catalog/build-catalog.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const csvPath = join(here, 'projector-lenses.csv');
const outPath = join(here, '../../src/optics/data/catalogData.json');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Shift range as [negative, positive] fractions; null when the sheet gives no usable range. */
export function parseShift(raw) {
  const s = raw.trim();
  if (!s) return null;
  if (/^not supported/i.test(s)) return [0, 0];
  if (/as printed|^V x/i.test(s)) return null;
  let m = s.match(/^±\s*(\d+(?:\.\d+)?)%$/);
  if (m) return [-m[1] / 100, m[1] / 100];
  m = s.match(/^([+-]?\d+(?:\.\d+)?)%\s*(?:\/|to)\s*([+-]?\d+(?:\.\d+)?)%/);
  if (m) {
    const a = Number(m[1]) / 100;
    const b = Number(m[2]) / 100;
    // "+50% / -16%" style: one side each way (0 counts as either side).
    if ((a >= 0 && b <= 0) || (a <= 0 && b >= 0)) return [Math.min(a, b), Math.max(a, b)];
    return null; // both the same sign: a fixed offset range, not a shift range
  }
  return null;
}

function parseResolution(raw) {
  const m = raw.match(/(\d{3,5})\s*x\s*(\d{3,5})/);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

function parseLumens(rows) {
  for (const r of rows) {
    const n = Number(r.lumens_ansi);
    if (r.lumens_ansi && Number.isFinite(n) && n > 0) return { lumens: n, lumensStandard: 'ANSI' };
  }
  for (const r of rows) {
    const m = r.notes.match(/(\d{1,2},\d{3})\s*(?:lm|lumens)\b([^;)]*)/i);
    if (m) {
      const iso = /ISO/i.test(m[2]) || /ISO/i.test(r.notes);
      return { lumens: Number(m[1].replace(',', '')), lumensStandard: iso ? 'ISO' : 'unstated' };
    }
  }
  return { lumens: null, lumensStandard: null };
}

const rows = parseCsv(readFileSync(csvPath, 'utf8'));
const byModel = new Map();
for (const r of rows) {
  const key = `${r.brand}|${r.model}`;
  if (!byModel.has(key)) byModel.set(key, []);
  byModel.get(key).push(r);
}

const projectors = [];
let skipped = 0;
for (const [, modelRows] of byModel) {
  const first = modelRows[0];
  const resolution = parseResolution(first.resolution);
  if (!resolution) {
    skipped += modelRows.length;
    continue;
  }
  const lenses = [];
  const seen = new Set();
  for (const r of modelRows) {
    const tMin = Number(r.throw_min);
    const tMax = Number(r.throw_max || r.throw_min);
    if (!r.throw_min || !Number.isFinite(tMin) || !Number.isFinite(tMax) || tMin <= 0) {
      skipped++;
      continue;
    }
    const id = slug(r.lens);
    if (seen.has(id)) continue;
    seen.add(id);
    const lo = Math.min(tMin, tMax);
    const hi = Math.max(tMin, tMax);
    const lens = {
      id,
      name: hi > lo ? `${r.lens} ${lo}–${hi}` : `${r.lens} ${lo}`,
      throwMin: lo,
      throwMax: hi,
      shiftV: parseShift(r.shift_v),
      shiftH: parseShift(r.shift_h),
      verified: r.verified || null,
      source: r.verify_source_url || r.source_url || null,
    };
    lenses.push(lens);
  }
  if (!lenses.length) continue;
  lenses.sort((a, b) => a.throwMin - b.throwMin || a.throwMax - b.throwMax);
  projectors.push({
    id: `${slug(first.brand)}-${slug(first.model)}`,
    brand: first.brand,
    model: first.model,
    ...parseLumens(modelRows),
    resolution,
    discontinued: modelRows.some((r) => /discontinued/i.test(r.notes)),
    lenses,
  });
}
projectors.sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model, 'en', { numeric: true }));

writeFileSync(outPath, JSON.stringify({ checkedOn: rows.map((r) => r.checked_on).filter(Boolean).sort().at(-1) ?? null, projectors }) + '\n');
const lensCount = projectors.reduce((n, p) => n + p.lenses.length, 0);
console.log(`${projectors.length} projectors, ${lensCount} lenses, ${skipped} rows skipped (no throw or resolution)`);
console.log('no lumens:', projectors.filter((p) => p.lumens == null).map((p) => p.model).join(', '));
