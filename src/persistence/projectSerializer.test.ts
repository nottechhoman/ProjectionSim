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
