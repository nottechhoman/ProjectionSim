import { describe, it, expect } from 'vitest';
import { DEFAULT_PROJECTORS, DEFAULT_SCENE_OBJECTS } from '../store/defaultScene';
import { parseProjectJson, serializeProject } from './projectSerializer';
import { PROJECT_FILE_VERSION, type ProjectSnapshotV2 } from './projectSchema';

const sample: ProjectSnapshotV2 = {
  version: PROJECT_FILE_VERSION,
  savedAt: '2026-09-07T00:00:00.000Z',
  name: 'Test Scene',
  sceneObjects: DEFAULT_SCENE_OBJECTS,
  projectors: DEFAULT_PROJECTORS,
  mediaAssets: [],
  materialPreviewMode: 'projectionPreview',
  projectionCompositeMode: 'unblended',
  selectedObjectId: 'proj-1',
  selectedProjectorId: 'proj-1',
  displayUnit: 'm',
  viewPreset: 'persp',
  transformMode: 'translate',
  leftPanelVisible: true,
  rightPanelVisible: true,
  bottomPanelVisible: true,
};

describe('projectSerializer', () => {
  it('round-trips a valid project snapshot', () => {
    const json = serializeProject(sample);
    const loaded = parseProjectJson(json);
    expect(loaded.name).toBe('Test Scene');
    expect(loaded.projectors[0].optics.throwRatio).toBe(1.5);
    expect(loaded.sceneObjects).toHaveLength(2);
    expect(loaded.version).toBe(2);
  });

  it('loads custom panel widths and clamps invalid values', () => {
    const withWidths = { ...sample, leftPanelWidth: 320, rightPanelWidth: 400 };
    const loaded = parseProjectJson(JSON.stringify(withWidths));
    expect(loaded.leftPanelWidth).toBe(320);
    expect(loaded.rightPanelWidth).toBe(400);

    const clamped = { ...sample, leftPanelWidth: 50, rightPanelWidth: 900 };
    const clampedLoaded = parseProjectJson(JSON.stringify(clamped));
    expect(clampedLoaded.leftPanelWidth).toBe(160);
    expect(clampedLoaded.rightPanelWidth).toBe(560);
  });

  it('loads popped-out panel state', () => {
    const popped = {
      ...sample,
      leftPanelPoppedOut: true,
      rightPanelPoppedOut: true,
      leftPanelFloat: { x: 24, y: 52 },
      rightPanelFloat: { x: 900, y: 80 },
    };
    const loaded = parseProjectJson(JSON.stringify(popped));
    expect(loaded.leftPanelPoppedOut).toBe(true);
    expect(loaded.rightPanelPoppedOut).toBe(true);
    expect(loaded.leftPanelFloat).toEqual({ x: 24, y: 52 });
    expect(loaded.rightPanelFloat?.x).toBeGreaterThan(0);
  });

  it('loads legacy v1 projects', () => {
    const v1 = { ...sample, version: 1, mediaAssets: undefined, materialPreviewMode: undefined };
    const loaded = parseProjectJson(JSON.stringify(v1));
    expect(loaded.version).toBe(2);
    expect(loaded.mediaAssets).toEqual([]);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseProjectJson('{not json')).toThrow(/valid JSON/i);
  });

  it('rejects invalid throw ratio', () => {
    const bad = {
      ...sample,
      projectors: [{ ...DEFAULT_PROJECTORS[0], optics: { ...DEFAULT_PROJECTORS[0].optics, throwRatio: 0 } }],
    };
    expect(() => parseProjectJson(JSON.stringify(bad))).toThrow(/Throw ratio/i);
  });
});
