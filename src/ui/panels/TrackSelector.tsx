import { useAppStore } from '../../store';

const btn = {
  minWidth: 26,
  height: 24,
  font: 'inherit',
  fontSize: 12,
  color: 'var(--text)',
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 6,
  cursor: 'pointer',
} as const;

/** Setlist: pick the active track (it drives transport, cues and timeline); add / duplicate / rename / reorder / delete. */
export function TrackSelector() {
  const show = useAppStore((s) => s.show);
  const setActive = useAppStore((s) => s.setActiveTrack);
  const addTrack = useAppStore((s) => s.addTrack);
  const duplicateTrack = useAppStore((s) => s.duplicateTrack);
  const renameTrack = useAppStore((s) => s.renameTrack);
  const removeTrack = useAppStore((s) => s.removeTrack);
  const moveTrack = useAppStore((s) => s.moveTrack);
  const active = show.tracks.find((t) => t.id === show.activeTrackId) ?? show.tracks[0];
  const index = show.tracks.indexOf(active);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} data-testid="track-selector">
      <select
        value={active.id}
        onChange={(e) => setActive(e.target.value)}
        aria-label="Active track"
        data-testid="track-select"
        style={{ ...btn, padding: '0 4px', maxWidth: 180 }}
      >
        {show.tracks.map((t, i) => (
          <option key={t.id} value={t.id}>
            {i + 1}. {t.name}
          </option>
        ))}
      </select>
      <button type="button" style={btn} onClick={addTrack} title="New track" aria-label="New track" data-testid="track-add">
        +
      </button>
      <button type="button" style={btn} onClick={() => duplicateTrack(active.id)} title="Duplicate track" aria-label="Duplicate track">
        ⧉
      </button>
      <button
        type="button"
        style={btn}
        onClick={() => {
          const name = window.prompt('Track name', active.name);
          if (name) renameTrack(active.id, name);
        }}
        title="Rename track"
        aria-label="Rename track"
        data-testid="track-rename"
      >
        ✎
      </button>
      <button type="button" style={btn} onClick={() => moveTrack(active.id, -1)} disabled={index === 0} title="Earlier in setlist" aria-label="Track earlier in setlist">
        ▲
      </button>
      <button type="button" style={btn} onClick={() => moveTrack(active.id, 1)} disabled={index === show.tracks.length - 1} title="Later in setlist" aria-label="Track later in setlist">
        ▼
      </button>
      <button
        type="button"
        style={btn}
        disabled={show.tracks.length <= 1}
        onClick={() => {
          if (window.confirm(`Delete track "${active.name}" and its layers, cues and sections?`)) removeTrack(active.id);
        }}
        title="Delete track"
        aria-label="Delete track"
      >
        ×
      </button>
    </span>
  );
}
