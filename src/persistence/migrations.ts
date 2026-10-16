import { validateOptics } from '../optics/validate';
import { migrateLegacyContent } from '../mapping/migrate';
import type { ProjectorConfig } from '../types';
import { ProjectValidationError } from './errors';
import { PROJECT_FILE_VERSION } from './projectSchema';

/**
 * Project file migration chain.
 *
 * Every saved project carries a schema `version`. migrateProject() validates the
 * structure, then applies each step (N → N+1) in order until the file is at the
 * current version. Each step is a pure function of the raw JSON and has its own
 * unit test (migrations.test.ts).
 *
 * Adding a schema change: bump PROJECT_FILE_VERSION, append one step here that
 * turns version N into N+1 (fill new fields, rename, reshape), add its test.
 * Do not add defaults for new fields in the loader.
 *
 * Fields added while the version stayed at 3 (v4–v9) cannot be told apart by version,
 * so the loader's normalizers still tolerate their absence; see docs/v10.md.
 */

export type RawProject = Record<string, unknown>;

export interface MigrationStep {
  from: number;
  to: number;
  description: string;
  up(data: RawProject): RawProject;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** v1 (original) → v2 (Advanced): v2 added imported media; v1 files have none. */
const v1ToV2: MigrationStep = {
  from: 1,
  to: 2,
  description: 'v1 → v2: imported media list (none in v1 files)',
  up(data) {
    return { ...data, version: 2, mediaAssets: [] };
  },
};

/**
 * v2 → v3 (app v4): content moves from projectors / the shared content canvas onto
 * layers sampled through mappings (src/mapping/migrate.ts).
 */
const v2ToV3: MigrationStep = {
  from: 2,
  to: 3,
  description: 'v2 → v3: content onto layers + mappings (show)',
  up(data) {
    const content = migrateLegacyContent({
      sceneObjects: data.sceneObjects as RawProject[],
      projectors: data.projectors as RawProject[],
      mappingMode: data.mappingMode,
      contentCanvas: data.contentCanvas,
      sharedContentSourceProjectorId: data.sharedContentSourceProjectorId,
    });
    const { mappingMode: _m, contentCanvas: _c, sharedContentSourceProjectorId: _s, ...rest } = data;
    return {
      ...rest,
      version: 3,
      sceneObjects: content.sceneObjects,
      projectors: content.projectors,
      show: content.show,
    };
  },
};

const IDENTITY_CORNERS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

function identityGrid(cols: number, rows: number) {
  const points: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) points.push({ x: c / (cols - 1), y: r / (rows - 1) });
  return { cols, rows, points, interpolation: 'bezier' };
}

/**
 * v3 → v4 (app v10): projector.warp { enabled, corners } becomes
 * { mode, cornerPin: { corners }, grid }. The mode is 'cornerPin' only where the
 * corner pin was enabled and not the identity — exactly when it changed the output
 * before — else 'none' (the corners are kept). Every projector gets a 5 × 5 identity grid.
 */
const v3ToV4: MigrationStep = {
  from: 3,
  to: 4,
  description: 'v3 → v4: warp modes (none / corner pin / grid)',
  up(data) {
    const projectors = (data.projectors as RawProject[]).map((p) => {
      const old = isObject(p.warp) ? p.warp : {};
      const corners =
        Array.isArray(old.corners) && old.corners.length === 4
          ? old.corners.map((c: unknown, i: number) =>
              isObject(c) && typeof c.x === 'number' && typeof c.y === 'number' ? { x: c.x, y: c.y } : { ...IDENTITY_CORNERS[i] },
            )
          : IDENTITY_CORNERS.map((c) => ({ ...c }));
      const identity = corners.every((c, i) => Math.abs(c.x - IDENTITY_CORNERS[i].x) < 1e-9 && Math.abs(c.y - IDENTITY_CORNERS[i].y) < 1e-9);
      const mode = old.enabled === true && !identity ? 'cornerPin' : 'none';
      return { ...p, warp: { mode, cornerPin: { corners }, grid: identityGrid(5, 5) } };
    });
    return { ...data, version: 4, projectors };
  },
};

/** Ordered steps; MIGRATIONS[i].from === MIGRATIONS[0].from + i. */
export const MIGRATIONS: readonly MigrationStep[] = [v1ToV2, v2ToV3, v3ToV4];

export const OLDEST_PROJECT_VERSION = MIGRATIONS[0].from;

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

const OBJECT_TYPES = ['screen', 'floor', 'wall', 'box', 'curvedScreen', 'model', 'ledWall'] as const;

function validateSceneObject(raw: unknown): RawProject {
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
  const projectionSides =
    raw.projectionSides === 'back' || raw.projectionSides === 'both'
      ? raw.projectionSides
      : raw.projectionSides === 'front'
        ? 'front'
        : undefined;
  return { ...raw, projectionSides };
}

function validateProjector(raw: unknown): RawProject {
  if (!isObject(raw)) throw new ProjectValidationError('Invalid projector');
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') {
    throw new ProjectValidationError('Projector missing id or name');
  }
  validateTransform(raw.transform);
  if (!isObject(raw.optics)) throw new ProjectValidationError('Invalid projector optics');
  const v = validateOptics(raw.optics as unknown as ProjectorConfig['optics']);
  if (!v.valid) throw new ProjectValidationError(v.error ?? 'Invalid projector optics');
  return raw;
}

/** Version-independent checks every project file must pass before migrating. */
function validateStructure(data: unknown): RawProject {
  if (!isObject(data)) throw new ProjectValidationError('Project root must be an object');
  const version = data.version;
  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < OLDEST_PROJECT_VERSION ||
    version > PROJECT_FILE_VERSION
  ) {
    throw new ProjectValidationError(
      `Unsupported project version: ${String(version)} (expected ${OLDEST_PROJECT_VERSION}–${PROJECT_FILE_VERSION})`,
    );
  }
  if (!Array.isArray(data.sceneObjects) || data.sceneObjects.length === 0) {
    throw new ProjectValidationError('Project must include at least one scene object');
  }
  if (!Array.isArray(data.projectors) || data.projectors.length === 0) {
    throw new ProjectValidationError('Project must include at least one projector');
  }
  return {
    ...data,
    sceneObjects: data.sceneObjects.map(validateSceneObject),
    projectors: data.projectors.map(validateProjector),
  };
}

/**
 * Single entry point: validate, then upgrade a parsed project file of any supported
 * version to PROJECT_FILE_VERSION. Throws ProjectValidationError.
 */
export function migrateProject(json: unknown, steps: readonly MigrationStep[] = MIGRATIONS): RawProject {
  let data = validateStructure(json);
  let version = data.version as number;
  while (version < PROJECT_FILE_VERSION) {
    const step = steps.find((s) => s.from === version);
    if (!step) throw new ProjectValidationError(`No migration from project version ${version}`);
    data = step.up(data);
    if (data.version !== step.to) throw new Error(`Migration ${step.from}→${step.to} left version ${String(data.version)}`);
    version = step.to;
  }
  return data;
}
