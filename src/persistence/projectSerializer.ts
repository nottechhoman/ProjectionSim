import type { MaterialPreviewMode, MediaAssetRecord, ProjectionCompositeMode, ProjectorConfig, SceneObject } from '../types';
import { DEFAULT_BLEND_EDGES, DEFAULT_BLEND_GAMMA } from '../types';
import { normalizeBlendSettings } from '../blending/advancedBlend';
import { normalizePrevizSettings } from '../optics/illuminance';
import { normalizeShow, pruneMappingRefs } from '../mapping/model';
import { normalizeWarp } from '../warp/warpFile';
import { ProjectValidationError } from './errors';
import { migrateProject } from './migrations';

export { ProjectValidationError };

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
  type ProjectSnapshot,
  type ProjectSnapshotV3,
} from './projectSchema';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeProjector(raw: ProjectorConfig): ProjectorConfig {
  return {
    ...raw,
    blendEdges: raw.blendEdges ?? { ...DEFAULT_BLEND_EDGES },
    blendGamma: raw.blendGamma ?? DEFAULT_BLEND_GAMMA,
    outerEdgeFade: raw.outerEdgeFade ?? false,
    lookAtEnabled: raw.lookAtEnabled ?? false,
    lookAtTarget: raw.lookAtTarget ?? { x: 0, y: 1.5, z: 0 },
    warp: normalizeWarp(raw.warp),
  };
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ProjectValidationError('File is not valid JSON');
  }

  // Validate and upgrade to the current schema (one step per version).
  const data = migrateProject(parsed);
  const content = {
    show: normalizeShow(data.show),
    sceneObjects: data.sceneObjects as unknown as SceneObject[],
    projectors: data.projectors as unknown as ProjectorConfig[],
  };
  const mediaAssets = validateMediaAssets(data.mediaAssets);
  const sceneObjects = content.sceneObjects;
  const projectors = content.projectors.map(normalizeProjector);
  const show = { ...content.show, mappings: pruneMappingRefs(content.show.mappings, sceneObjects, projectors) };

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
        : data.materialPreviewMode === 'falloff'
          ? 'falloff'
          : data.materialPreviewMode === 'blendSum' ||
              data.materialPreviewMode === 'surfaceUv' ||
              data.materialPreviewMode === 'illuminance' ||
              data.materialPreviewMode === 'pixelDensity'
            ? data.materialPreviewMode
          : 'projectionPreview';
  const projectionCompositeMode: ProjectionCompositeMode =
    data.projectionCompositeMode === 'heatmap' ||
    data.projectionCompositeMode === 'blended' ||
    data.projectionCompositeMode === 'solo'
      ? data.projectionCompositeMode
      : 'unblended';

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

  const snapshot: ProjectSnapshotV3 = {
    version: PROJECT_FILE_VERSION,
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : new Date().toISOString(),
    name: typeof data.name === 'string' ? data.name : 'Untitled',
    sceneObjects,
    projectors,
    mediaAssets,
    materialPreviewMode,
    projectionCompositeMode,
    show,
    calculationTargetId,
    analysisQuality,
    calculationTargetSide,
    blendSettings: normalizeBlendSettings(isObject(data.blendSettings) ? (data.blendSettings as never) : undefined),
    previzSettings: normalizePrevizSettings(isObject(data.previzSettings) ? (data.previzSettings as never) : undefined),
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
