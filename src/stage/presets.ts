import type { ProjectorConfig, ProjectionSides, SceneObject, Show, Vec3 } from '../types';
import { DEFAULT_BLEND_EDGES, DEFAULT_BLEND_GAMMA, MAX_PROJECTORS, PROJECTOR_PALETTE } from '../types';
import { createDirectMapping, createLayer, createPerspectiveMapping, createShow, isScreen } from '../mapping/model';
import { applyLookAtToProjector } from '../optics/lookAt';
import { eulerYXZToQuaternion } from '../utils/euler';

/**
 * v9: built-in stage templates (disguise-style "stage presets"). Audience sits on +Z,
 * upstage is −Z, Y is up, metres. Each preset is a whole scene: set pieces, screens,
 * projectors aimed with look-at, and a show with a Direct mapping + UV grid per screen.
 */

export type StagePresetId =
  | 'proscenium'
  | 'blackBox'
  | 'curvedCyc'
  | 'ledConcert'
  | 'corporateWide'
  | 'immersiveRoom'
  | 'facade'
  | 'scrimCyc';

export interface StagePreset {
  id: StagePresetId;
  name: string;
  description: string;
}

export interface StagePresetScene {
  sceneObjects: SceneObject[];
  projectors: ProjectorConfig[];
  show: Show;
  /** The main screen (analysis / blend target). */
  calculationTargetId: string | null;
}

export const STAGE_PRESETS: StagePreset[] = [
  { id: 'proscenium', name: 'Proscenium theatre', description: 'Stage deck, proscenium arch and a flat cyc lit by 2 blended FOH projectors.' },
  { id: 'curvedCyc', name: 'Curved cyc', description: 'Wide curved cyclorama on a deck, 3 projectors blended across the curve.' },
  { id: 'scrimCyc', name: 'Scrim + cyc', description: 'Front gauze (light passes through) and a rear-projected cyc behind it.' },
  { id: 'blackBox', name: 'Black box + floor', description: 'Studio theatre: back wall plus an overhead projector on the stage floor, with a rostrum casting shadows.' },
  { id: 'ledConcert', name: 'LED concert stage', description: 'Main LED wall upstage, two projected IMAG screens and a lighting truss.' },
  { id: 'corporateWide', name: 'Corporate wide screen', description: '32:9 screen on a low riser with a lectern, 2 blended projectors.' },
  { id: 'immersiveRoom', name: 'Immersive room', description: 'Three walls and the floor, one projector each (4 total).' },
  { id: 'facade', name: 'Building facade', description: 'Projection mapping a building front with a 2 × 2 projector stack and columns.' },
];

// ---------------------------------------------------------------------------
// Builders (also used by Add → Set pieces)
// ---------------------------------------------------------------------------

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}${seq}`;
}

interface Orient {
  yaw?: number;
  pitch?: number;
}

export function screenPiece(
  name: string,
  position: Vec3,
  width: number,
  height: number,
  opts: Orient & { sides?: ProjectionSides; blocks?: boolean } = {},
): SceneObject {
  return {
    id: uid('screen'),
    name,
    type: 'screen',
    transform: { position, quaternion: eulerYXZToQuaternion(opts.yaw ?? 0, opts.pitch ?? 0, 0) },
    visibleInEditor: true,
    receivesProjection: true,
    blocksProjection: opts.blocks ?? true,
    projectionSides: opts.sides ?? 'front',
    dimensions: { width, height },
  };
}

export function boxPiece(
  name: string,
  position: Vec3,
  size: { width: number; height: number; depth: number },
  opts: Orient & { receives?: boolean } = {},
): SceneObject {
  return {
    id: uid('box'),
    name,
    type: 'box',
    transform: { position, quaternion: eulerYXZToQuaternion(opts.yaw ?? 0, opts.pitch ?? 0, 0) },
    visibleInEditor: true,
    receivesProjection: opts.receives ?? false,
    blocksProjection: true,
    dimensions: { ...size },
  };
}

export function floorPiece(size: number): SceneObject {
  return {
    id: uid('floor'),
    name: 'Floor',
    type: 'floor',
    transform: { position: { x: 0, y: 0, z: 0 }, quaternion: eulerYXZToQuaternion(0, 0, 0) },
    visibleInEditor: true,
    receivesProjection: false,
    blocksProjection: true,
    dimensions: { width: size, height: size },
  };
}

/** Curved screen whose arc sits upstage of `centre` (concave side towards the audience). */
export function curvedPiece(name: string, centre: Vec3, radius: number, arcAngleDeg: number, height: number): SceneObject {
  return {
    id: uid('curved'),
    name,
    type: 'curvedScreen',
    transform: { position: centre, quaternion: eulerYXZToQuaternion(180, 0, 0) },
    visibleInEditor: true,
    receivesProjection: true,
    blocksProjection: true,
    projectionSides: 'both',
    dimensions: { width: radius * 2, height },
    curved: { radius, arcAngleDeg, height },
  };
}

export function ledPiece(
  name: string,
  position: Vec3,
  width: number,
  height: number,
  pixels: { width: number; height: number },
  yaw = 0,
): SceneObject {
  return {
    id: uid('ledwall'),
    name,
    type: 'ledWall',
    transform: { position, quaternion: eulerYXZToQuaternion(yaw, 0, 0) },
    visibleInEditor: true,
    receivesProjection: false,
    blocksProjection: true,
    projectionSides: 'front',
    dimensions: { width, height },
    ledWall: { pixelResolution: { ...pixels } },
  };
}

/**
 * A projector at `position` aimed (look-at) at `target`, with a throw ratio chosen so
 * the image is `imageWidth` wide at the target. 16:10 WUXGA unless `wide` (16:9 1080p).
 */
export function aimedProjector(
  index: number,
  name: string,
  position: Vec3,
  target: Vec3,
  imageWidth: number,
  opts: { wide?: boolean; lumens?: number } = {},
): ProjectorConfig {
  const distance = Math.hypot(target.x - position.x, target.y - position.y, target.z - position.z);
  const resolution = opts.wide ? { width: 1920, height: 1080 } : { width: 1920, height: 1200 };
  const throwRatio = Math.round((distance / imageWidth) * 100) / 100;
  return applyLookAtToProjector({
    id: uid('proj'),
    name,
    enabled: true,
    color: PROJECTOR_PALETTE[index % PROJECTOR_PALETTE.length],
    transform: { position, quaternion: [0, 0, 0, 1] },
    optics: {
      throwRatio,
      resolution,
      aspectRatio: resolution.width / resolution.height,
      lensShiftH: 0,
      lensShiftV: 0,
      nearLimit: 0.1,
      farLimit: Math.max(100, Math.ceil(distance * 2)),
    },
    brightness: 1,
    blendEdges: { ...DEFAULT_BLEND_EDGES },
    blendGamma: DEFAULT_BLEND_GAMMA,
    outerEdgeFade: false,
    lookAtEnabled: true,
    lookAtTarget: target,
    lumens: opts.lumens ?? 20000,
  });
}

/** Show for a scene: a Direct mapping + UV grid layer per screen, a locked Perspective mapping per projector. */
export function showForScene(sceneObjects: SceneObject[], projectors: ProjectorConfig[]): Show {
  const screens = sceneObjects.filter(isScreen);
  const directs = screens.map((s) => createDirectMapping(s));
  const receivers = sceneObjects.filter((o) => o.receivesProjection && o.type !== 'ledWall').map((o) => o.id);
  const perspectives = projectors.map((p) => createPerspectiveMapping(p, receivers));
  const layers = directs.map((m, i) =>
    createLayer({ kind: 'pattern', pattern: 'uvGrid', color: '#ffffff' }, m.id, { name: `${screens[i].name} grid` }),
  );
  return createShow([...directs, ...perspectives], layers);
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

function proscenium(): StagePresetScene {
  const deckTop = 1;
  const cyc = screenPiece('Cyc', v(0, deckTop + 0.5 + 2.1, -9.5), 12, 4.2);
  const w = 6.9;
  const cx = 6 - w / 2;
  const objects = [
    floorPiece(40),
    boxPiece('Stage deck', v(0, deckTop / 2, -5), { width: 14, height: deckTop, depth: 10 }),
    boxPiece('Proscenium left', v(-7.75, 4.75, 0.4), { width: 1.5, height: 9.5, depth: 0.8 }),
    boxPiece('Proscenium right', v(7.75, 4.75, 0.4), { width: 1.5, height: 9.5, depth: 0.8 }),
    boxPiece('Proscenium header', v(0, 8.75, 0.4), { width: 17, height: 1.5, depth: 0.8 }),
    cyc,
  ];
  const t = cyc.transform.position;
  const projectors = [
    aimedProjector(0, 'FOH left', v(-cx, 7, 20), v(-cx, t.y, t.z), w),
    aimedProjector(1, 'FOH right', v(cx, 7, 20), v(cx, t.y, t.z), w),
  ];
  return { sceneObjects: objects, projectors, show: showForScene(objects, projectors), calculationTargetId: cyc.id };
}

function curvedCyc(): StagePresetScene {
  const radius = 10;
  const cyc = curvedPiece('Curved cyc', v(0, 3.5, 0), radius, 100, 4.5);
  const objects = [floorPiece(50), boxPiece('Stage deck', v(0, 0.5, -4.5), { width: 18, height: 1, depth: 12 }), cyc];
  const projectors = [-33, 0, 33].map((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const target = v(radius * Math.sin(a), 3.5, -radius * Math.cos(a));
    return aimedProjector(i, ['Left', 'Centre', 'Right'][i], v(target.x * 0.6, 6, 14), target, 7);
  });
  return { sceneObjects: objects, projectors, show: showForScene(objects, projectors), calculationTargetId: cyc.id };
}

function scrimCyc(): StagePresetScene {
  const scrim = screenPiece('Scrim (gauze)', v(0, 4, -1), 12, 6, { blocks: false });
  const cyc = screenPiece('Cyc', v(0, 4, -8), 12, 6, { sides: 'both' });
  const objects = [
    floorPiece(40),
    boxPiece('Stage deck', v(0, 0.5, -4.5), { width: 14, height: 1, depth: 9 }),
    scrim,
    cyc,
  ];
  const projectors = [
    aimedProjector(0, 'FOH (scrim)', v(0, 7, 20), v(0, 4, -1), 12.4),
    aimedProjector(1, 'Rear (cyc)', v(0, 4, -16), v(0, 4, -8), 12.4),
  ];
  return { sceneObjects: objects, projectors, show: showForScene(objects, projectors), calculationTargetId: scrim.id };
}

function blackBox(): StagePresetScene {
  const back = screenPiece('Back wall', v(0, 2.25, -5), 10, 4.5);
  const stageFloor = screenPiece('Stage floor', v(0, 0.01, -1.5), 9.6, 6, { pitch: -90 });
  const objects = [
    floorPiece(30),
    back,
    stageFloor,
    boxPiece('Rostrum', v(2, 0.3, -2), { width: 2, height: 0.6, depth: 1.2 }),
    boxPiece('Cube', v(-2.5, 0.4, -0.5), { width: 0.8, height: 0.8, depth: 0.8 }),
  ];
  const projectors = [
    aimedProjector(0, 'Overhead (floor)', v(0, 8, -1.5), v(0, 0, -1.5), 10),
    aimedProjector(1, 'Front (wall)', v(0, 5, 8), v(0, 2.25, -5), 10.4),
  ];
  return { sceneObjects: objects, projectors, show: showForScene(objects, projectors), calculationTargetId: back.id };
}

function ledConcert(): StagePresetScene {
  const deckTop = 1.5;
  const imagL = screenPiece('IMAG left', v(-12, 6, -6), 6, 3.375, { yaw: 20 });
  const imagR = screenPiece('IMAG right', v(12, 6, -6), 6, 3.375, { yaw: -20 });
  const objects = [
    floorPiece(60),
    boxPiece('Stage deck', v(0, deckTop / 2, -5), { width: 16, height: deckTop, depth: 10 }),
    ledPiece('LED main', v(0, deckTop + 0.3 + 2.8125, -9.5), 10, 5.625, { width: 3840, height: 2160 }),
    boxPiece('Lighting truss', v(0, 10, -6), { width: 20, height: 0.4, depth: 0.4 }),
    imagL,
    imagR,
  ];
  const projectors = [
    aimedProjector(0, 'IMAG left', v(-10, 5, 25), imagL.transform.position, 6.2, { wide: true }),
    aimedProjector(1, 'IMAG right', v(10, 5, 25), imagR.transform.position, 6.2, { wide: true }),
  ];
  return { sceneObjects: objects, projectors, show: showForScene(objects, projectors), calculationTargetId: imagL.id };
}

function corporateWide(): StagePresetScene {
  const riser = 0.6;
  const screen = screenPiece('Wide screen 32:9', v(0, riser + 0.6 + 1.97, -5.5), 14, 3.94);
  const w = 7.5;
  const cx = 7 - w / 2;
  const objects = [
    floorPiece(40),
    boxPiece('Riser', v(0, riser / 2, -2.5), { width: 12, height: riser, depth: 5 }),
    boxPiece('Lectern', v(4, riser + 0.6, -1.5), { width: 0.6, height: 1.2, depth: 0.5 }),
    screen,
  ];
  const t = screen.transform.position;
  const projectors = [
    aimedProjector(0, 'Left', v(-cx, 4.5, 15), v(-cx, t.y, t.z), w, { wide: true }),
    aimedProjector(1, 'Right', v(cx, 4.5, 15), v(cx, t.y, t.z), w, { wide: true }),
  ];
  return { sceneObjects: objects, projectors, show: showForScene(objects, projectors), calculationTargetId: screen.id };
}

function immersiveRoom(): StagePresetScene {
  const h = 4.5;
  const front = screenPiece('Front wall', v(0, h / 2, -3), 8, h);
  const left = screenPiece('Left wall', v(-4, h / 2, 0), 6, h, { yaw: 90 });
  const right = screenPiece('Right wall', v(4, h / 2, 0), 6, h, { yaw: -90 });
  const floor = screenPiece('Floor', v(0, 0.01, 0), 8, 6, { pitch: -90 });
  const objects = [front, left, right, floor];
  const projectors = [
    aimedProjector(0, 'Front wall', v(0, 4.2, 2.8), front.transform.position, 8, { wide: true }),
    aimedProjector(1, 'Left wall', v(3.6, 4.2, 0), left.transform.position, 8, { wide: true }),
    aimedProjector(2, 'Right wall', v(-3.6, 4.2, 0), right.transform.position, 8, { wide: true }),
    aimedProjector(3, 'Floor', v(0, 4.4, 0.4), v(0, 0, 0), 8, { wide: true }),
  ];
  return { sceneObjects: objects, projectors, show: showForScene(objects, projectors), calculationTargetId: front.id };
}

function facade(): StagePresetScene {
  const facadeScreen = screenPiece('Facade', v(0, 7, 0.02), 24, 14);
  const objects = [
    floorPiece(100),
    boxPiece('Building', v(0, 7, -6), { width: 24, height: 14, depth: 12 }),
    boxPiece('Column left', v(-4, 3, 1), { width: 0.8, height: 6, depth: 0.8 }),
    boxPiece('Column right', v(4, 3, 1), { width: 0.8, height: 6, depth: 0.8 }),
    facadeScreen,
  ];
  const w = 13.2;
  const cols = [-(12 - w / 2), 12 - w / 2];
  const rows = [7 - 2.875, 7 + 2.875];
  const projectors = rows.flatMap((y, r) =>
    cols.map((x, c) =>
      aimedProjector(r * 2 + c, `${r === 0 ? 'Low' : 'High'} ${c === 0 ? 'left' : 'right'}`, v(x * 0.3, 3 + r * 1.2, 40), v(x, y, 0), w, {
        lumens: 31000,
      }),
    ),
  );
  return { sceneObjects: objects, projectors, show: showForScene(objects, projectors), calculationTargetId: facadeScreen.id };
}

const BUILDERS: Record<StagePresetId, () => StagePresetScene> = {
  proscenium,
  blackBox,
  curvedCyc,
  ledConcert,
  corporateWide,
  immersiveRoom,
  facade,
  scrimCyc,
};

export function buildStagePreset(id: StagePresetId): StagePresetScene {
  const scene = BUILDERS[id]();
  if (scene.projectors.length > MAX_PROJECTORS) throw new Error(`Preset ${id} has too many projectors`);
  return scene;
}

// ---------------------------------------------------------------------------
// Single set pieces for Add → Set pieces
// ---------------------------------------------------------------------------

export type SetPieceId = 'flatScreen' | 'floorArea' | 'scrim' | 'stageDeck' | 'proscenium' | 'column';

export const SET_PIECES: { id: SetPieceId; name: string }[] = [
  { id: 'flatScreen', name: 'Flat screen' },
  { id: 'floorArea', name: 'Floor projection area' },
  { id: 'scrim', name: 'Scrim (gauze)' },
  { id: 'stageDeck', name: 'Stage deck' },
  { id: 'proscenium', name: 'Proscenium arch' },
  { id: 'column', name: 'Column' },
];

export function buildSetPiece(id: SetPieceId): SceneObject[] {
  switch (id) {
    case 'flatScreen':
      return [screenPiece('Screen', v(0, 2, -2), 4, 2.25)];
    case 'floorArea':
      return [screenPiece('Floor area', v(0, 0.01, 1), 6, 4, { pitch: -90 })];
    case 'scrim':
      return [screenPiece('Scrim', v(0, 3, 1), 8, 5, { blocks: false })];
    case 'stageDeck':
      return [boxPiece('Stage deck', v(0, 0.5, -3), { width: 10, height: 1, depth: 6 })];
    case 'proscenium':
      return [
        boxPiece('Proscenium left', v(-5.75, 4, 1.5), { width: 1.5, height: 8, depth: 0.6 }),
        boxPiece('Proscenium right', v(5.75, 4, 1.5), { width: 1.5, height: 8, depth: 0.6 }),
        boxPiece('Proscenium header', v(0, 7.25, 1.5), { width: 13, height: 1.5, depth: 0.6 }),
      ];
    case 'column':
      return [boxPiece('Column', v(2, 2, 2), { width: 0.6, height: 4, depth: 0.6 })];
  }
}
