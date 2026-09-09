import { describe, it, expect } from 'vitest';
import { computeNominalProjection } from '../optics/nominal';
import { computeSampledCoverageAnalysis, ANALYSIS_QUALITY_PRESETS } from './coverageAnalysis';
import { DEFAULT_PROJECTORS, DEFAULT_SCENE_OBJECTS } from '../store/defaultScene';
import { eulerYXZToQuaternion } from '../utils/euler';
import type { ProjectorConfig, SceneObject, CalculationTargetSide } from '../types';
import { snapshotToSlice, sliceToSnapshot } from '../store/persistenceHelpers';
import { buildCalculationCsv } from '../persistence/reportExport';

const AREA_TOLERANCE = 0.12;
const TIGHT_TOLERANCE = 0.03;

function cloneProjector(patch: Partial<ProjectorConfig> = {}): ProjectorConfig {
  const base = structuredClone(DEFAULT_PROJECTORS[0]);
  return { ...base, ...patch, optics: { ...base.optics, ...(patch.optics ?? {}) } };
}

function defaultScreen(): SceneObject {
  return structuredClone(DEFAULT_SCENE_OBJECTS.find((o) => o.id === 'screen-1')!);
}

function analyze(
  sceneObjects: SceneObject[],
  projectors: ProjectorConfig[],
  receiverId = 'screen-1',
  quality: 'draft' | 'high' = 'high',
  targetSide: CalculationTargetSide = 'front',
) {
  const receiver = sceneObjects.find((o) => o.id === receiverId)!;
  return computeSampledCoverageAnalysis({
    receiver,
    sceneObjects,
    projectors,
    quality,
    targetSide,
  })!;
}

describe('Coverage reliability — sampled analysis', () => {
  it('1. nominal optics remain 4.0 m × 2.25 m at documented setup', () => {
    const nominal = computeNominalProjection(DEFAULT_PROJECTORS[0].optics, 6);
    expect(nominal.width).toBeCloseTo(4.0, 3);
    expect(nominal.height).toBeCloseTo(2.25, 3);
  });

  it('2. one projector with no blocker: visible matches geometric', () => {
    const result = analyze(DEFAULT_SCENE_OBJECTS, DEFAULT_PROJECTORS);
    expect(result.receiverArea).toBeCloseTo(20.25, 2);
    expect(result.geometricCoveredArea).toBeGreaterThan(0);
    expect(result.visibleCoveredArea).toBeCloseTo(result.geometricCoveredArea, 2);
    expect(result.occlusionLossArea).toBeCloseTo(0, 2);
  });

  it('3. fully blocking box reduces visible coverage to zero', () => {
    const scene = structuredClone(DEFAULT_SCENE_OBJECTS);
    scene.push({
      id: 'blocker-full',
      name: 'Full blocker',
      type: 'box',
      transform: {
        position: { x: 0, y: 1.5, z: 3 },
        quaternion: eulerYXZToQuaternion(0, 0, 0),
      },
      visibleInEditor: true,
      receivesProjection: false,
      blocksProjection: true,
      dimensions: { width: 8, height: 5, depth: 0.5 },
    });
    const result = analyze(scene, DEFAULT_PROJECTORS);
    expect(result.geometricCoveredArea).toBeGreaterThan(0);
    expect(result.visibleCoveredArea).toBeCloseTo(0, 1);
    expect(result.occlusionLossArea).toBeCloseTo(result.geometricCoveredArea, TIGHT_TOLERANCE);
  });

  it('4. half-footprint blocker reduces visible coverage by roughly half', () => {
    const scene = structuredClone(DEFAULT_SCENE_OBJECTS);
    scene.push({
      id: 'blocker-half',
      name: 'Half blocker',
      type: 'box',
      transform: {
        position: { x: -1.5, y: 1.5, z: 3 },
        quaternion: eulerYXZToQuaternion(0, 0, 0),
      },
      visibleInEditor: true,
      receivesProjection: false,
      blocksProjection: true,
      dimensions: { width: 3, height: 3.5, depth: 0.5 },
    });
    const unobstructed = analyze(DEFAULT_SCENE_OBJECTS, DEFAULT_PROJECTORS);
    const obstructed = analyze(scene, DEFAULT_PROJECTORS);
    expect(obstructed.visibleCoveredArea).toBeLessThan(unobstructed.visibleCoveredArea * 0.75);
    expect(obstructed.visibleCoveredArea).toBeGreaterThan(unobstructed.visibleCoveredArea * 0.2);
  });

  it('5. blocksProjection=false does not reduce visible coverage', () => {
    const scene = structuredClone(DEFAULT_SCENE_OBJECTS);
    scene.push({
      id: 'blocker-off',
      name: 'Non-blocking box',
      type: 'box',
      transform: {
        position: { x: 0, y: 1.5, z: 3 },
        quaternion: eulerYXZToQuaternion(0, 0, 0),
      },
      visibleInEditor: true,
      receivesProjection: false,
      blocksProjection: false,
      dimensions: { width: 8, height: 5, depth: 0.5 },
    });
    const baseline = analyze(DEFAULT_SCENE_OBJECTS, DEFAULT_PROJECTORS);
    const withBox = analyze(scene, DEFAULT_PROJECTORS);
    expect(withBox.visibleCoveredArea).toBeCloseTo(baseline.visibleCoveredArea, 2);
  });

  it('6. two identical projectors: union does not double; overlap equals covered area', () => {
    const p1 = cloneProjector({ id: 'proj-a', name: 'A' });
    const p2 = cloneProjector({ id: 'proj-b', name: 'B' });
    const single = analyze(DEFAULT_SCENE_OBJECTS, [p1]);
    const pair = analyze(DEFAULT_SCENE_OBJECTS, [p1, p2]);
    expect(pair.visibleCoveredArea).toBeCloseTo(single.visibleCoveredArea, TIGHT_TOLERANCE);
    expect(pair.visibleOverlapArea).toBeCloseTo(pair.visibleCoveredArea, TIGHT_TOLERANCE);
  });

  it('7. three identical projectors count multi-coverage once', () => {
    const projectors = [
      cloneProjector({ id: 'proj-a', name: 'A' }),
      cloneProjector({ id: 'proj-b', name: 'B' }),
      cloneProjector({ id: 'proj-c', name: 'C' }),
    ];
    const result = analyze(DEFAULT_SCENE_OBJECTS, projectors);
    expect(result.visibleOverlapArea).toBeCloseTo(result.visibleCoveredArea, TIGHT_TOLERANCE);
    expect(result.visibleOverlapArea).toBeLessThan(result.visibleCoveredArea * 3);
  });

  it('8. one projector blocked and another unobstructed preserves receiver coverage', () => {
    const scene = structuredClone(DEFAULT_SCENE_OBJECTS);
    scene.push({
      id: 'blocker-left',
      name: 'Left blocker',
      type: 'box',
      transform: {
        position: { x: -1.5, y: 1.5, z: 3 },
        quaternion: eulerYXZToQuaternion(0, 0, 0),
      },
      visibleInEditor: true,
      receivesProjection: false,
      blocksProjection: true,
      dimensions: { width: 3, height: 3.5, depth: 0.5 },
    });
    const blockedOnly = analyze(scene, [cloneProjector({ id: 'proj-a' })]);
    const blockedPlusClear = analyze(scene, [
      cloneProjector({ id: 'proj-a' }),
      cloneProjector({ id: 'proj-b', transform: { position: { x: 2, y: 1.5, z: 6 }, quaternion: eulerYXZToQuaternion(0, 0, 0) } }),
    ]);
    expect(blockedOnly.visibleCoveredArea).toBeLessThan(blockedPlusClear.visibleCoveredArea);
    expect(blockedPlusClear.visibleCoveredArea).toBeGreaterThan(0);
  });

  it('9. front receiving screen can block a rear screen when blocksProjection is enabled', () => {
    const front = defaultScreen();
    front.id = 'front-screen';
    front.blocksProjection = true;
    front.transform.position = { x: 0, y: 1.5, z: 0.5 };

    const rear: SceneObject = {
      id: 'rear-screen',
      name: 'Rear',
      type: 'screen',
      transform: {
        position: { x: 0, y: 1.5, z: -2 },
        quaternion: eulerYXZToQuaternion(0, 0, 0),
      },
      visibleInEditor: true,
      receivesProjection: true,
      blocksProjection: false,
      dimensions: { width: 6, height: 3.375 },
    };

    const scene = [rear, front, ...DEFAULT_SCENE_OBJECTS.filter((o) => o.type === 'floor')];
    const unobstructed = analyze([rear, ...DEFAULT_SCENE_OBJECTS.filter((o) => o.type === 'floor')], DEFAULT_PROJECTORS, 'rear-screen');
    const obstructed = analyze(scene, DEFAULT_PROJECTORS, 'rear-screen');
    expect(obstructed.visibleCoveredArea).toBeLessThan(unobstructed.visibleCoveredArea);
  });

  it('10. curved screen sampling handles arc, transforms, and blockers', () => {
    const curved: SceneObject = {
      id: 'curve-1',
      name: 'Curve',
      type: 'curvedScreen',
      transform: {
        position: { x: 0, y: 1.5, z: 0 },
        quaternion: eulerYXZToQuaternion(0, 0, 0),
      },
      visibleInEditor: true,
      receivesProjection: true,
      blocksProjection: false,
      dimensions: { width: 6, height: 3.375 },
      curved: { radius: 4, arcAngleDeg: 90, height: 3.375 },
    };
    const floor = DEFAULT_SCENE_OBJECTS.find((o) => o.type === 'floor')!;
    const scene = [curved, floor];
    const open = analyze(scene, DEFAULT_PROJECTORS, 'curve-1');
    expect(open.receiverArea).toBeGreaterThan(0);
    expect(open.visibleCoveredArea).toBeGreaterThan(0);

    const blockedScene: SceneObject[] = [
      curved,
      floor,
      {
        id: 'curve-blocker',
        name: 'Curve blocker',
        type: 'box',
        transform: {
          position: { x: 0, y: 1.5, z: 2 },
          quaternion: eulerYXZToQuaternion(0, 0, 0),
        },
        visibleInEditor: true,
        receivesProjection: false,
        blocksProjection: true,
        dimensions: { width: 6, height: 4, depth: 0.5 },
      },
    ];
    const blocked = analyze(blockedScene, DEFAULT_PROJECTORS, 'curve-1');
    expect(blocked.visibleCoveredArea).toBeLessThan(open.visibleCoveredArea);
  });

  it('11. results are independent of viewport camera (pure function)', () => {
    const first = analyze(DEFAULT_SCENE_OBJECTS, DEFAULT_PROJECTORS);
    const second = analyze(DEFAULT_SCENE_OBJECTS, DEFAULT_PROJECTORS);
    expect(second).toEqual(first);
  });

  it('12. higher sampling resolution converges toward stable coverage', () => {
    const draft = analyze(DEFAULT_SCENE_OBJECTS, DEFAULT_PROJECTORS, 'screen-1', 'draft');
    const high = analyze(DEFAULT_SCENE_OBJECTS, DEFAULT_PROJECTORS, 'screen-1', 'high');
    expect(high.samplingResolution.u).toBeGreaterThan(draft.samplingResolution.u);
    const visibleRelDiff =
      Math.abs(high.visibleCoveredArea - draft.visibleCoveredArea) / Math.max(draft.visibleCoveredArea, 1e-6);
    const geometricRelDiff =
      Math.abs(high.geometricCoveredArea - draft.geometricCoveredArea) /
      Math.max(draft.geometricCoveredArea, 1e-6);
    expect(visibleRelDiff).toBeLessThan(AREA_TOLERANCE);
    expect(geometricRelDiff).toBeLessThan(AREA_TOLERANCE);
  });

  it('13. invalid target clears safely via null receiver', () => {
    const screen = defaultScreen();
    screen.receivesProjection = false;
    const result = computeSampledCoverageAnalysis({
      receiver: screen,
      sceneObjects: DEFAULT_SCENE_OBJECTS,
      projectors: DEFAULT_PROJECTORS,
      quality: 'draft',
      targetSide: 'front',
    });
    expect(result).toBeNull();
  });

  it('14. persistence and reports include analysis target and sampled metrics', () => {
    const slice = snapshotToSlice({
      version: 2,
      savedAt: new Date().toISOString(),
      name: 'Coverage',
      sceneObjects: DEFAULT_SCENE_OBJECTS,
      projectors: DEFAULT_PROJECTORS,
      mediaAssets: [],
      materialPreviewMode: 'projectionPreview',
      projectionCompositeMode: 'unblended',
      calculationTargetId: 'screen-1',
      analysisQuality: 'high',
      calculationTargetSide: 'front',
      selectedObjectId: 'proj-1',
      selectedProjectorId: 'proj-1',
      displayUnit: 'm',
      viewPreset: 'persp',
      transformMode: 'translate',
      leftPanelVisible: true,
      rightPanelVisible: true,
      bottomPanelVisible: true,
    });
    expect(slice.analysisQuality).toBe('high');
    expect(slice.calculationTargetSide).toBe('front');
    expect(slice.calculationTargetId).toBe('screen-1');

    const analysis = analyze(slice.sceneObjects, slice.projectors);
    const csv = buildCalculationCsv({
      projectName: slice.projectName,
      displayUnit: slice.displayUnit,
      projectors: slice.projectors,
      calculationResults: {
        nominal: null,
        footprint: null,
        opticsError: null,
        overlap: null,
        coverageAnalysis: analysis,
        calculationTarget: { id: 'screen-1', name: 'Screen', type: 'screen' },
      },
    });
    expect(csv).toContain('Coverage (sampled)');
    expect(csv).toContain('Visible covered area');
    expect(sliceToSnapshot(slice).analysisQuality).toBe('high');
  });

  it('documents sampling presets', () => {
    expect(ANALYSIS_QUALITY_PRESETS.draft.planarU).toBe(32);
    expect(ANALYSIS_QUALITY_PRESETS.high.planarU).toBe(64);
  });

  it('analyzes back side separately from front for dual-sided screens', () => {
    const scene = structuredClone(DEFAULT_SCENE_OBJECTS);
    const screen = scene.find((o) => o.id === 'screen-1')!;
    screen.projectionSides = 'both';

    const front = analyze(scene, DEFAULT_PROJECTORS, 'screen-1', 'high', 'front');
    const back = analyze(scene, DEFAULT_PROJECTORS, 'screen-1', 'high', 'back');
    const combined = analyze(scene, DEFAULT_PROJECTORS, 'screen-1', 'high', 'both');

    expect(front.visibleCoveredArea).toBeGreaterThan(0);
    expect(back.visibleCoveredArea).toBeCloseTo(0, 1);
    expect(combined.receiverArea).toBeCloseTo(front.receiverArea * 2, 2);
    expect(combined.perSide?.front?.visibleCoveredArea).toBeCloseTo(front.visibleCoveredArea, 2);
    expect(combined.perSide?.back?.visibleCoveredArea).toBeCloseTo(back.visibleCoveredArea, 2);
  });
});
