import { useAppStore } from '../../store';
import { illuminanceRampCss } from '../../optics/illuminanceRamp';

const SCALE_PRESETS: Record<'lux' | 'nits', number[]> = {
  nits: [100, 250, 500, 1000, 2000, 5000],
  lux: [300, 750, 1500, 3000, 6000, 15000],
};

/** v5 previz: colour scale + controls shown over the viewport in brightness mode. */
export function IlluminanceLegend() {
  const mode = useAppStore((s) => s.materialPreviewMode);
  const settings = useAppStore((s) => s.previzSettings);
  const setPrevizSettings = useAppStore((s) => s.setPrevizSettings);
  if (mode !== 'illuminance') return null;

  const { unit, scaleMax } = settings;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * scaleMax));

  const switchUnit = (next: 'lux' | 'nits') => {
    if (next === unit) return;
    // Keep the scale meaning roughly the same on a matte screen (nits ≈ lux / π).
    const converted = next === 'nits' ? scaleMax / Math.PI : scaleMax * Math.PI;
    const presets = SCALE_PRESETS[next];
    const nearest = presets.reduce((a, b) => (Math.abs(b - converted) < Math.abs(a - converted) ? b : a));
    setPrevizSettings({ unit: next, scaleMax: nearest });
  };

  return (
    <div
      data-testid="illuminance-legend"
      style={{
        position: 'absolute',
        left: 12,
        bottom: 12,
        zIndex: 5,
        width: 'min(320px, calc(100% - 24px))',
        padding: '8px 10px',
        borderRadius: 8,
        background: 'rgba(20, 20, 20, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        color: '#ddd',
        fontSize: 12,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <strong style={{ flex: 1 }}>Brightness</strong>
        <select
          aria-label="Brightness unit"
          data-testid="illuminance-unit"
          value={unit}
          onChange={(e) => switchUnit(e.target.value as 'lux' | 'nits')}
        >
          <option value="nits">nits (cd/m²)</option>
          <option value="lux">lux</option>
        </select>
        <select
          aria-label="Scale maximum"
          data-testid="illuminance-scale"
          value={scaleMax}
          onChange={(e) => setPrevizSettings({ scaleMax: Number(e.target.value) })}
        >
          {Array.from(new Set([...SCALE_PRESETS[unit], scaleMax]))
            .sort((a, b) => a - b)
            .map((v) => (
              <option key={v} value={v}>
                max {v}
              </option>
            ))}
        </select>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <input
          type="checkbox"
          data-testid="illuminance-spill"
          checked={settings.spillEverywhere}
          onChange={(e) => setPrevizSettings({ spillEverywhere: e.target.checked })}
        />
        Show spill on every surface (walls, floor, objects)
      </label>
      <div style={{ height: 10, borderRadius: 3, background: illuminanceRampCss() }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, opacity: 0.8 }}>
        {ticks.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
      <div style={{ marginTop: 4, opacity: 0.65 }}>
        Lines every 10 %. Pink = over max. Uses lumens, distance, angle
        {unit === 'nits' ? ` and screen gain ${settings.screenGain}` : ''}; follows the Raw / Blend mode.
      </div>
    </div>
  );
}
