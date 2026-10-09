/** Heatmap colours, low → high. Keep in sync with illuminanceRamp() in multiProjection.frag.glsl. */
export const ILLUMINANCE_RAMP: [number, number, number][] = [
  [0.07, 0.04, 0.2],
  [0.16, 0.25, 0.8],
  [0.1, 0.7, 0.75],
  [0.35, 0.82, 0.25],
  [0.98, 0.82, 0.15],
  [0.92, 0.22, 0.12],
];

/** CSS linear-gradient for the legend bar. */
export function illuminanceRampCss(direction = 'to right'): string {
  const stops = ILLUMINANCE_RAMP.map(([r, g, b], i) => {
    const pct = (i / (ILLUMINANCE_RAMP.length - 1)) * 100;
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}) ${pct}%`;
  });
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}
