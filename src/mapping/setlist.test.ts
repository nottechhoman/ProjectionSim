import { describe, expect, it } from 'vitest';
import {
  activeTrack,
  addTrackToShow,
  createLayer,
  createShow,
  duplicateTrackInShow,
  moveTrackInShow,
  removeTrackFromShow,
  renameTrackInShow,
  setActiveTrackInShow,
} from './model';

describe('setlist (tracks)', () => {
  const base = () => {
    const show = createShow([], [createLayer({ kind: 'solid', color: '#fff' }, null)]);
    show.tracks[0].cues.push({ id: 'c1', name: 'Cue 1', timeSec: 3 });
    return show;
  };

  it('adds a track and makes it active', () => {
    const s = addTrackToShow(base());
    expect(s.tracks).toHaveLength(2);
    expect(activeTrack(s).name).toBe('Track 2');
    expect(activeTrack(s).layers).toEqual([]);
  });

  it('duplicates with fresh ids for the track, layers and cues', () => {
    const show = base();
    const s = duplicateTrackInShow(show, show.tracks[0].id);
    const [a, b] = s.tracks;
    expect(b.name).toBe('Track 1 copy');
    expect(s.activeTrackId).toBe(b.id);
    expect(b.id).not.toBe(a.id);
    expect(b.layers[0].id).not.toBe(a.layers[0].id);
    expect(b.cues[0].id).not.toBe(a.cues[0].id);
    expect(b.cues[0].timeSec).toBe(3);
  });

  it('renames, reorders, switches and removes (never the last track)', () => {
    let s = addTrackToShow(base());
    const [first, second] = s.tracks;
    s = renameTrackInShow(s, second.id, '  Encore ');
    expect(s.tracks[1].name).toBe('Encore');
    expect(renameTrackInShow(s, second.id, '   ')).toBe(s);
    s = moveTrackInShow(s, second.id, -1);
    expect(s.tracks.map((t) => t.id)).toEqual([second.id, first.id]);
    expect(moveTrackInShow(s, second.id, -1)).toBe(s);
    s = setActiveTrackInShow(s, first.id);
    expect(s.activeTrackId).toBe(first.id);
    s = removeTrackFromShow(s, first.id);
    expect(s.tracks).toHaveLength(1);
    expect(s.activeTrackId).toBe(second.id);
    expect(removeTrackFromShow(s, second.id)).toBe(s);
  });
});
