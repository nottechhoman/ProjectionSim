import { describe, expect, it } from 'vitest';
import { MIGRATIONS, migrateProject, OLDEST_PROJECT_VERSION, type RawProject } from './migrations';
import { parseProjectJson, ProjectValidationError } from './projectSerializer';
import { PROJECT_FILE_VERSION } from './projectSchema';
import v1Minimal from './fixtures/v1-minimal.projectionlab.json?raw';

const BUNDLED = import.meta.glob('../../public/samples/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const TEST_SAMPLES = import.meta.glob('../../samples/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const step = (from: number) => MIGRATIONS.find((s) => s.from === from)!;

function minimalV1(): RawProject {
  return JSON.parse(v1Minimal) as RawProject;
}

describe('migration chain', () => {
  it('is contiguous from the oldest version to the current one', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    MIGRATIONS.forEach((s, i) => {
      expect(s.from).toBe(OLDEST_PROJECT_VERSION + i);
      expect(s.to).toBe(s.from + 1);
    });
    expect(MIGRATIONS[MIGRATIONS.length - 1].to).toBe(PROJECT_FILE_VERSION);
  });

  it('rejects unknown, future and non-numeric versions', () => {
    const base = minimalV1();
    for (const version of [0, PROJECT_FILE_VERSION + 1, '3', 1.5, undefined]) {
      expect(() => migrateProject({ ...base, version })).toThrow(ProjectValidationError);
    }
  });

  it('rejects files without scene objects or projectors', () => {
    expect(() => migrateProject({ ...minimalV1(), sceneObjects: [] })).toThrow(/scene object/);
    expect(() => migrateProject({ ...minimalV1(), projectors: [] })).toThrow(/projector/);
  });

  it('leaves a current-version file untouched apart from validation', () => {
    const current = migrateProject(minimalV1());
    expect(migrateProject(current)).toEqual(current);
  });

  it('applies steps in order and stops at the current version', () => {
    const seen: number[] = [];
    const spy = MIGRATIONS.map((s) => ({ ...s, up: (d: RawProject) => (seen.push(s.from), s.up(d)) }));
    const out = migrateProject(minimalV1(), spy);
    expect(seen).toEqual(MIGRATIONS.map((s) => s.from));
    expect(out.version).toBe(PROJECT_FILE_VERSION);
  });

  it('fails clearly when a step is missing', () => {
    expect(() => migrateProject(minimalV1(), [step(1)])).toThrow(/No migration from project version 2/);
  });
});

describe('step 1 → 2 (imported media list)', () => {
  it('adds an empty media list and keeps everything else', () => {
    const v1: RawProject = { ...minimalV1(), mediaAssets: [{ id: 'stray', name: 'x', kind: 'image', mimeType: 'image/png' }] };
    const out = step(1).up(v1);
    expect(out.version).toBe(2);
    expect(out.mediaAssets).toEqual([]);
    expect(out.projectors).toEqual(v1.projectors);
    expect(out.sceneObjects).toEqual(v1.sceneObjects);
    expect(out.name).toBe('v1 minimal');
  });
});

describe('step 2 → 3 (content onto layers + mappings)', () => {
  it('moves raw projector content onto a locked Perspective mapping layer', () => {
    const v2 = step(1).up(minimalV1());
    const out = step(2).up(v2);
    expect(out.version).toBe(3);
    const projector = (out.projectors as RawProject[])[0];
    expect(projector.testPattern).toBeUndefined();
    expect(projector.mediaSource).toBeUndefined();
    const show = out.show as { mappings: { kind: string; perspective?: { lockToProjectorId: string } }[]; tracks: { layers: { media: unknown }[] }[] };
    expect(show.mappings).toHaveLength(1);
    expect(show.mappings[0].kind).toBe('perspective');
    expect(show.mappings[0].perspective?.lockToProjectorId).toBe('proj-1');
    expect(show.tracks[0].layers[0].media).toEqual({ kind: 'pattern', pattern: 'uvGrid', color: '#4fc3f7' });
  });

  it('drops the v2 mapping fields', () => {
    const v2 = { ...step(1).up(minimalV1()), mappingMode: 'sharedCanvas', contentCanvas: { enabled: false }, sharedContentSourceProjectorId: 'proj-1' };
    const out = step(2).up(v2);
    expect(out).not.toHaveProperty('mappingMode');
    expect(out).not.toHaveProperty('contentCanvas');
    expect(out).not.toHaveProperty('sharedContentSourceProjectorId');
    const show = out.show as { mappings: { kind: string }[] };
    expect(show.mappings.map((m) => m.kind)).toEqual(['direct']);
  });
});

describe('loading whole projects', () => {
  it('loads a hand-written v1-era minimal project', () => {
    const p = parseProjectJson(v1Minimal);
    expect(p.version).toBe(PROJECT_FILE_VERSION);
    expect(p.mediaAssets).toEqual([]);
    expect(p.sceneObjects.map((o) => o.id)).toEqual(['screen-1']);
    expect(p.projectors[0].warp).toEqual({ enabled: false, corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] });
    expect(p.show.tracks[0].layers).toHaveLength(1);
  });

  const all = { ...BUNDLED, ...TEST_SAMPLES };
  it('covers the three bundled samples', () => {
    expect(Object.keys(BUNDLED)).toHaveLength(3);
  });
  for (const [path, text] of Object.entries(all)) {
    it(`loads ${path.replace(/^.*\//, '')} (${path.includes('public') ? 'bundled' : 'test'} sample)`, () => {
      const raw = JSON.parse(text) as RawProject;
      const p = parseProjectJson(text);
      expect(p.version).toBe(PROJECT_FILE_VERSION);
      expect(p.sceneObjects).toHaveLength((raw.sceneObjects as unknown[]).length);
      expect(p.projectors).toHaveLength((raw.projectors as unknown[]).length);
      const mappingIds = new Set(p.show.mappings.map((m) => m.id));
      const layers = p.show.tracks.flatMap((t) => t.layers);
      expect(layers.length).toBeGreaterThan(0);
      for (const l of layers) expect(l.mappingId === null || mappingIds.has(l.mappingId)).toBe(true);
      // Saving and loading again is stable (compared as JSON: -0 saves as 0).
      const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;
      const again = parseProjectJson(JSON.stringify(p));
      expect(json(again.show)).toEqual(json(p.show));
      expect(json(again.projectors)).toEqual(json(p.projectors));
      expect(json(again.sceneObjects)).toEqual(json(p.sceneObjects));
    });
  }
});
