/** HH:MM:SS:FF timecode (non-drop-frame) for a time in seconds. */
export function formatTimecode(sec: number, fps: number): string {
  const f = Math.max(1, Math.round(fps));
  const totalFrames = Math.floor(Math.max(0, sec) * f + 1e-6);
  const frames = totalFrames % f;
  const totalSec = Math.floor(totalFrames / f);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(h)}:${two(m)}:${two(s)}:${two(frames)}`;
}

/** Parse HH:MM:SS:FF (or fewer fields, right-aligned) into seconds; null if invalid. */
export function parseTimecode(text: string, fps: number): number | null {
  const parts = text.trim().split(/[:;.]/).map((p) => Number(p));
  if (parts.length === 0 || parts.length > 4 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  while (parts.length < 4) parts.unshift(0);
  const [h, m, s, f] = parts;
  return h * 3600 + m * 60 + s + f / Math.max(1, Math.round(fps));
}

/** Snap a time to the frame grid. */
export function snapToFrame(sec: number, fps: number): number {
  const f = Math.max(1, Math.round(fps));
  return Math.round(sec * f) / f;
}
