/**
 * Minimal ZIP writer (stored, no compression) — enough for warp exports without a
 * dependency. Names are UTF-8; sizes must stay under 4 GB (no ZIP64).
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array | string;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Fixed DOS timestamp (1980-01-01) so the same input gives the same bytes. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

export function createZip(entries: readonly ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const files = entries.map((e) => {
    const name = enc.encode(e.name);
    const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    return { name, data, crc: crc32(data) };
  });
  const localSize = files.reduce((n, f) => n + 30 + f.name.length + f.data.length, 0);
  const centralSize = files.reduce((n, f) => n + 46 + f.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let o = 0;
  const offsets: number[] = [];
  for (const f of files) {
    offsets.push(o);
    view.setUint32(o, 0x04034b50, true);
    view.setUint16(o + 4, 20, true); // version needed
    view.setUint16(o + 6, 0x0800, true); // UTF-8 names
    view.setUint16(o + 8, 0, true); // stored
    view.setUint16(o + 10, DOS_TIME, true);
    view.setUint16(o + 12, DOS_DATE, true);
    view.setUint32(o + 14, f.crc, true);
    view.setUint32(o + 18, f.data.length, true);
    view.setUint32(o + 22, f.data.length, true);
    view.setUint16(o + 26, f.name.length, true);
    view.setUint16(o + 28, 0, true);
    out.set(f.name, o + 30);
    out.set(f.data, o + 30 + f.name.length);
    o += 30 + f.name.length + f.data.length;
  }
  const centralStart = o;
  files.forEach((f, i) => {
    view.setUint32(o, 0x02014b50, true);
    view.setUint16(o + 4, 20, true); // version made by
    view.setUint16(o + 6, 20, true);
    view.setUint16(o + 8, 0x0800, true);
    view.setUint16(o + 10, 0, true);
    view.setUint16(o + 12, DOS_TIME, true);
    view.setUint16(o + 14, DOS_DATE, true);
    view.setUint32(o + 16, f.crc, true);
    view.setUint32(o + 20, f.data.length, true);
    view.setUint32(o + 24, f.data.length, true);
    view.setUint16(o + 28, f.name.length, true);
    // extra, comment, disk, internal attrs = 0
    view.setUint32(o + 38, 0, true); // external attrs
    view.setUint32(o + 42, offsets[i], true);
    out.set(f.name, o + 46);
    o += 46 + f.name.length;
  });
  view.setUint32(o, 0x06054b50, true);
  view.setUint16(o + 8, files.length, true);
  view.setUint16(o + 10, files.length, true);
  view.setUint32(o + 12, o - centralStart, true);
  view.setUint32(o + 16, centralStart, true);
  return out;
}

/** File names in a ZIP (central directory) — used by tests and import checks. */
export function listZip(zip: Uint8Array): string[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('Not a ZIP file');
  const count = view.getUint16(end + 10, true);
  let o = view.getUint32(end + 16, true);
  const dec = new TextDecoder();
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const nameLen = view.getUint16(o + 28, true);
    const extra = view.getUint16(o + 30, true);
    const comment = view.getUint16(o + 32, true);
    names.push(dec.decode(zip.subarray(o + 46, o + 46 + nameLen)));
    o += 46 + nameLen + extra + comment;
  }
  return names;
}
