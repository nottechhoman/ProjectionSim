import { validateOptics } from '../optics/validate';
import type { MaterialPreviewMode, MediaAssetRecord, ProjectionCompositeMode, ProjectorConfig, ProjectionSides, SceneObject } from '../types';
import { DEFAULT_BLEND_EDGES } from '../types';
import {
  clampPanelWidth,
  clampFloatPosition,
  DEFAULT_LEFT_PANEL_WIDTH,
  DEFAULT_RIGHT_PANEL_WIDTH,
  defaultLeftPanelFloat,
  defaultRightPanelFloat,
  FLOATING_PANEL_HEIGHT,
} from '../ui/panelLayout';
import {
  PROJECT_FILE_VERSION,
  PROJECT_FILE_VERSION_LEGACY,
  type ProjectSnapshot,
  type ProjectSnapshotV2,
} from './projectSchema';

export class ProjectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectValidationError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateTransform(raw: unknown): void {
  if (!isObject(raw)) throw new ProjectValidationError('Invalid transform');
  const pos = raw.position;
  if (!isObject(pos)) throw new ProjectValidationError('Invalid transform.position');
  for (const axis of ['x', 'y', 'z'] as const) {
    if (typeof pos[axis] !== 'number' || !Number.isFinite(pos[axis])) {
      throw new ProjectValidationError(`Invalid transform.position.${axis}`);
    }
  }
  const q = raw.quaternion;
  if (!Array.isArray(q) || q.length !== 4 || q.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    throw new ProjectValidationError('Invalid transform.quaternion');
  }
}

const OBJECT_TYPES = ['screen', 'floor', 'wall', 'box', 'curvedScreen', 'model'] as const;

function validateSceneObject(raw: unknown): SceneObject {
  if (!isObject(raw)) throw new ProjectValidationError('Invalid scene object');
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') {
    throw new ProjectValidationError('Scene object missing id or name');
  }
  if (!OBJECT_TYPES.includes(String(raw.type) as (typeof OBJECT_TYPES)[number])) {
    throw new ProjectValidationError(`Unknown scene object type: ${String(raw.type)}`);
  }
  validateTransform(raw.transform);
  if (!isObject(raw.dimensions)) throw new ProjectValidationError('Invalid dimensions');
  const { width, height } = raw.dimensions;
  if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) {
    throw new ProjectValidationError('Invalid scene object dimensions');
  }
  const projectionSides: ProjectionSides | undefined =
    raw.projectionSides === 'back' || raw.projectionSides === 'both'
      ? raw.projectionSides
      : raw.projectionSides === 'front'
        ? 'front'
        : undefined;
  return {
    ...(raw as unknown as SceneObject),
    projectionSides,
  };
}

function normalizeProjector(raw: ProjectorConfig): ProjectorConfig {
  return {
    ...raw,
    mediaSource: raw.mediaSource ?? 'pattern',
    mediaAssetId: raw.mediaAssetId ?? null,
    mediaFit: raw.mediaFit ?? 'contain',
    blendEdges: raw.blendEdges ?? { ...DEFAULT_BLEND_EDGES },
    outerEdgeFade: raw.outerEdgeFade ?? false,
  };
}

function validateProjector(raw: unknown): ProjectorConfig {
  if (!isObject(raw)) throw new ProjectValidationError('Invalid projector');
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') {
    throw new ProjectValidationError('Projector missing id or name');
  }
  validateTransform(raw.transform);
  if (!isObject(raw.optics)) throw new ProjectValidationError('Invalid projector optics');
  const optics = raw.optics as unknown as ProjectorConfig['optics'];
  const v = validateOptics(optics);
  if (!v.valid) throw new ProjectValidationError(v.error ?? 'Invalid projector optics');
  return normalizeProjector(raw as unknown as ProjectorConfig);
}

function validateMediaAssets(raw: unknown): MediaAssetRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is MediaAssetRecord =>
      isObject(item) &&
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      (item.kind === 'image' || item.kind === 'video' || item.kind === 'model') &&
      typeof item.mimeType === 'string',
  );
}

export function serializeProject(snapshot: ProjectSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

export function parseProjectJson(text: string): ProjectSnapshot {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProjectValidationError('File is not valid JSON');
  }

  if (!isObject(data)) throw new ProjectValidationError('Project root must be an object');
  const version = data.version;
  if (version !== PROJECT_FILE_VERSION && version !== PROJECT_FILE_VERSION_LEGACY) {
    throw new ProjectValidationError(
      `Unsupported project version: ${String(version)} (expected ${PROJECT_FILE_VERSION} or ${PROJECT_FILE_VERSION_LEGACY})`,
    );
  }

  if (!Array.isArray(data.sceneObjects) || data.sceneObjects.length === 0) {
    throw new ProjectValidationError('Project must include at least one scene object');
  }
  if (!Array.isArray(data.projectors) || data.projectors.length === 0) {
    throw new ProjectValidationError('Project must include at least one projector');
  }

  const sceneObjects = data.sceneObjects.map(validateSceneObject);
  const projectors = data.projectors.map(validateProjector);
  const mediaAssets = version === PROJECT_FILE_VERSION ? validateMediaAssets(data.mediaAssets) : [];

  const selectedObjectId =
    data.selectedObjectId === null || typeof data.selectedObjectId === 'string'
      ? data.selectedObjectId
      : null;
  const selectedProjectorId =
    typeof data.selectedProjectorId === 'string' ? data.selectedProjectorId : projectors[0].id;

  const materialPreviewMode: MaterialPreviewMode =
    data.materialPreviewMode === 'original'
      ? 'original'
      : data.materialPreviewMode === 'projectionUv'
        ? 'projectionUv'
        : 'projectionPreview';
  const projectionCompositeMode: ProjectionCompositeMode =
    data.projectionCompositeMode === 'heatmap' ||
    data.projectionCompositeMode === 'blended' ||
    data.projectionCompositeMode === 'solo'
      ? data.projectionCompositeMode
      : 'unblended';

  const mappingMode: import('../types').MappingMode =
    data.mappingMode === 'sharedCanvas' ? 'sharedCanvas' : 'raw';
  const sharedContentSourceProjectorId =
    typeof data.sharedContentSourceProjectorId === 'string'
      ? data.sharedContentSourceProjectorId
      : undefined;
  const calculationTargetId =
    typeof data.calculationTargetId === 'string' ? data.calculationTargetId : undefined;
  const analysisQuality =
    data.analysisQuality === 'high' ? 'high' : data.analysisQuality === 'draft' ? 'draft' : undefined;
  const calculationTargetSide =
    data.calculationTargetSide === 'back' || data.calculationTargetSide === 'both'
      ? data.calculationTargetSide
      : data.calculationTargetSide === 'front'
        ? 'front'
        : undefined;

  const snapshot: ProjectSnapshotV2 = {
    version: PROJECT_FILE_VERSION,
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : new Date().toISOString(),
    name: typeof data.name === 'string' ? data.name : 'Untitled',
    sceneObjects,
    projectors,
    mediaAssets,
    materialPreviewMode,
    projectionCompositeMode,
    mappingMode,
    sharedContentSourceProjectorId,
    calculationTargetId,
    analysisQuality,
    calculationTargetSide,
    selectedObjectId,
    selectedProjectorId,
    displayUnit: data.displayUnit === 'cm' || data.displayUnit === 'mm' ? data.displayUnit : 'm',
    viewPreset:
      data.viewPreset === 'top' || data.viewPreset === 'front' || data.viewPreset === 'side'
        ? data.viewPreset
        : 'persp',
    transformMode: data.transformMode === 'rotate' ? 'rotate' : 'translate',
    leftPanelVisible: data.leftPanelVisible !== false,
    rightPanelVisible: data.rightPanelVisible !== false,
    bottomPanelVisible: data.bottomPanelVisible !== false,
    leftPanelWidth: clampPanelWidth(
      typeof data.leftPanelWidth === 'number' ? data.leftPanelWidth : DEFAULT_LEFT_PANEL_WIDTH,
    ),
    rightPanelWidth: clampPanelWidth(
      typeof data.rightPanelWidth === 'number' ? data.rightPanelWidth : DEFAULT_RIGHT_PANEL_WIDTH,
    ),
    leftPanelPoppedOut: data.leftPanelPoppedOut === true,
    rightPanelPoppedOut: data.rightPanelPoppedOut === true,
    leftPanelFloat:
      isObject(data.leftPanelFloat) &&
      typeof data.leftPanelFloat.x === 'number' &&
      typeof data.leftPanelFloat.y === 'number'
        ? clampFloatPosition(
            data.leftPanelFloat.x,
            data.leftPanelFloat.y,
            clampPanelWidth(
              typeof data.leftPanelWidth === 'number' ? data.leftPanelWidth : DEFAULT_LEFT_PANEL_WIDTH,
            ),
            FLOATING_PANEL_HEIGHT,
          )
        : defaultLeftPanelFloat(
            clampPanelWidth(
              typeof data.leftPanelWidth === 'number' ? data.leftPanelWidth : DEFAULT_LEFT_PANEL_WIDTH,
            ),
          ),
    rightPanelFloat:
      isObject(data.rightPanelFloat) &&
      typeof data.rightPanelFloat.x === 'number' &&
      typeof data.rightPanelFloat.y === 'number'
        ? clampFloatPosition(
            data.rightPanelFloat.x,
            data.rightPanelFloat.y,
            clampPanelWidth(
              typeof data.rightPanelWidth === 'number' ? data.rightPanelWidth : DEFAULT_RIGHT_PANEL_WIDTH,
            ),
            FLOATING_PANEL_HEIGHT,
          )
        : defaultRightPanelFloat(
            clampPanelWidth(
              typeof data.rightPanelWidth === 'number' ? data.rightPanelWidth : DEFAULT_RIGHT_PANEL_WIDTH,
            ),
          ),
  };

  return snapshot;
}

export function downloadProjectFile(snapshot: ProjectSnapshot, filename?: string): void {
  const blob = new Blob([serializeProject(snapshot)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename ?? `${snapshot.name.replace(/\s+/g, '-').toLowerCase() || 'projectionlab'}.projectionlab.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
