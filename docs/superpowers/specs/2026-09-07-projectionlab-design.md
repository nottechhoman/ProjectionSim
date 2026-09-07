# ProjectionLab — Design Specification

**Date:** 2026-09-07  
**Status:** Approved (brainstorming)  
**Requirements source:** `ProjectionLab.md`  
**Scope:** Milestone 1 implementation with full-architecture slots for Milestones 2–4

---

## 1. Summary

ProjectionLab is a browser-based 3D projection planning simulator. Users create metric scenes, position projectors, configure lens optics, and preview projective texturing onto scene geometry with accurate footprint calculations and occlusion.

This design implements **Milestone 1** (single-projector simulator) while defining extension points for media import, multi-projector blending, persistence, and polish in later milestones.

**Stack:** TypeScript, React, Vite, native Three.js (WebGL2), custom GLSL, Zustand, CSS modules, Vitest.

**Explicitly not simulated:** manufacturer lens distortion, UST/mirror optics, focus/DoF, photometric certification, hardware sync.

---

## 2. Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Layered engine + pure math (Approach A) | Matches spec module boundaries; optics testable without WebGL |
| Milestone focus | M1 now; M2–M4 slots pre-defined | User request (option B) |
| UI styling | Plain CSS modules | Minimal deps; technical tool aesthetic |
| UI shell | Full four-panel layout from M1 | Stable slots; avoid React tree restructure later |
| Scene management | Native Three.js via `SceneEngine` class | Spec forbids mixing R3F; React mounts viewport only |
| Render pipeline | Sequential passes in M1; promote to RenderGraph in M3 | YAGNI for one projector; clear M3 extension |
| State | Zustand (scene, projector, ui slices) | Lightweight; decoupled from renderer |
| Persistence | Deferred to M2 | M1 ships sample scene only |
| Playwright | Deferred to M4 | Vitest covers optics/coverage in M1 |

---

## 3. Coordinate Conventions

| Rule | Value |
|------|-------|
| Scene unit | 1 unit = 1 meter |
| Handedness | Right-handed |
| Up axis | +Y |
| Projector local forward | −Z |
| Optical origin | Lens center (separate from body mesh) |
| Orientation storage | Quaternion internally |
| UI rotation | Yaw / pitch / roll in degrees, **YXZ** Euler order |
| Positive yaw | Projector-local +X rotates toward +Y (left-hand rule around world +Y when identity) |
| Lens shift H | Image-center displacement / full image width; + = right |
| Lens shift V | Image-center displacement / full image height; + = up |
| Display units | m, cm, mm input; m² areas; degrees angles; px/m density |

Internal calculations use full precision; no rounding in math modules.

---

## 4. Module Architecture

```
src/
  optics/           Pure throw-ratio, FOV, lens-shift matrix, ray unprojection
  projection/       GLSL shaders, projective ShaderMaterial, test patterns
  visibility/       Per-projector depth render pass
  coverage/         Footprint polygons, ray-plane intersection (M1: planar)
  blending/         Stub in M1; blend weight functions in M3
  media/            Stub in M1; test patterns procedural; image/video in M2
  scene/            SceneEngine, scene objects, helpers, OrbitControls
  persistence/      Stub in M1; JSON + IndexedDB in M2
  store/            Zustand slices
  ui/               React panels, Viewport wrapper
  types/            Shared interfaces
```

### Milestone mapping

| Module | M1 | M2 | M3 | M4 |
|--------|----|----|----|----|
| `optics/` | Full | — | — | — |
| `projection/` | Single projector | + media textures | + blend, shared-canvas | quality tiers |
| `visibility/` | 1 depth pass | — | N depth passes | quality caps |
| `coverage/` | Planar footprint | Curved sampling | Overlap/heatmap | throttle on drag |
| `scene/` | Screen, floor, wall, box | GLB, curved screen | 4 projectors | undo/redo |
| `media/` | Procedural patterns | Image/video | Shared texture reuse | codec errors |
| `persistence/` | — | JSON save/load | Blend settings | CSV/HTML export |
| `ui/` | Full shell | Import dialogs | Blend inspector | reports, perf HUD |

---

## 5. Optics Module

### Types

```typescript
interface ProjectorOptics {
  throwRatio: number;
  throwRatioMin?: number;
  throwRatioMax?: number;
  resolution: { width: number; height: number };
  aspectRatio: number;
  lensShiftH: number;
  lensShiftV: number;
  nearLimit: number;
  farLimit: number;
}

interface NominalProjection {
  width: number;
  height: number;
  diagonal: number;
  area: number;
  horizontalFovDeg: number;
  verticalFovDeg: number;
  pixelsPerMeterH: number;
  pixelsPerMeterV: number;
  mmPerPixelH: number;
}
```

### Formulas

- W = D / T
- H = W / A
- horizontalFOV = 2 × atan(1 / (2T))
- verticalFOV = 2 × atan(1 / (2TA))
- horizontalPixelsPerMeter = resolution.width / W
- horizontalMillimetersPerPixel = 1000 × W / resolution.width

### Functions

- `computeNominalProjection(optics, distance)` — perpendicular-plane reference case
- `validateOptics(optics)` — reject zero, negative, non-finite values
- `buildProjectionMatrix(optics, worldMatrix)` — off-axis perspective with lens shift
- `unprojectRasterRay(optics, u, v, worldMatrix)` — world-space ray for coverage

**Single source of truth:** same matrix/uniforms for shader, frustum helpers, and calculation inspector.

---

## 6. Rendering Pipeline

### SceneEngine (framework-agnostic)

Owned by React `Viewport`; not a React component internally.

**M1 render sequence:**

1. For each enabled projector → `DepthPass` (blockers + receivers; exclude helpers)
2. For each receiving surface → `ProjectivePass` (sample pattern/texture with depth test)
3. `HelperPass` (grid, axes, frustum, footprint outline, projector body)
4. Editor camera composite to canvas

Editor camera never modifies projector uniforms.

### Projection shader (per fragment)

1. World position → projector clip space
2. Reject behind near plane
3. Perspective divide
4. Reject outside frustum
5. NDC → raster UV
6. Sample source (procedural pattern in M1)
7. Apply brightness; accumulate linear light

### Occlusion

- Depth map from projector POV each frame geometry/projectors change
- Compare receiving-fragment depth with bias in shader
- Video playback alone does not regenerate depth maps

### Object flags

Each scene object: `visibleInEditor`, `receivesProjection`, `blocksProjection`.

Transparent materials treated as opaque blockers in M1 (documented limitation).

---

## 7. Coverage Module (M1: planar)

For finite planar screens:

1. Unproject corner (and edge) raster rays
2. Intersect with screen plane → footprint polygon in screen-local 2D
3. Clip to screen boundary
4. Report unclipped vs clipped area, corner coordinates, edge lengths

Edge cases:

- Parallel ray → null intersection, no NaN
- Behind projector → empty footprint
- Small screen inside large footprint → correct clipped measurement
- All corner rays miss finite mesh → report separately

Rotation test (Acceptance Test 3): footprint matches independent ray-plane math.

---

## 8. UI Design

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Toolbar: Units | Views | Add ▾ | Measure                     │
├──────────┬──────────────────────────────────────┬───────────┤
│ Left     │         3D Viewport                  │ Right     │
│ Scene    │                                      │ Inspector │
│ tree     │                                      │           │
├──────────┴──────────────────────────────────────┴───────────┤
│ Bottom: status | performance | warnings                       │
└─────────────────────────────────────────────────────────────┘
```

CSS modules per panel. Dark neutral theme.

### M1 panel contents

| Panel | Content |
|-------|---------|
| Toolbar | Units (m/cm/mm), view presets (persp/top/front/side), add box, measure toggle |
| Left | Scene hierarchy with visibility toggles |
| Center | Orbit/pan/zoom, metric grid, selection, two-point measure |
| Right | Transform, lens/raster, test pattern, live calculations |
| Bottom | WebGL2 status, frame time, shader warnings |

Toolbar slots for New/Open/Save/Import/Screenshot exist but show "Coming in M2/M4" until implemented.

### Viewport controls

- OrbitControls on editor camera only
- Raycast selection → updates store → inspector
- Numeric transform inputs (visual gizmos deferred to M4)

---

## 9. State Management

### Zustand slices

**sceneSlice:** objects (id, type, transform, dimensions, flags), selection, measure points

**projectorSlice:** projector array (M1: one entry), optics, enabled, color, pattern, selected id

**uiSlice:** display units, view preset, material preview mode

### Sync pattern

Store changes → `SceneEngine.onStateChange()` diffs and updates Three.js graph + uniforms → coverage recompute → results pushed to store → inspector re-renders.

---

## 10. Default Sample Scene

| Object | Configuration |
|--------|---------------|
| Screen | (0, 1.5, 0), 6 × 3.375 m, receives projection, +Z normal |
| Floor | Y = 0, 20 × 20 m, blocks projection |
| Projector | (0, 1.5, 6), identity, throw 1.5, 1920×1080, checkerboard |

Expected (Acceptance Test 1): 4.0 m × 2.25 m, 9.0 m², ~4.589 m diagonal, 480 px/m, ~2.083 mm/px.

---

## 11. Error Handling

| Case | Behavior |
|------|----------|
| Invalid throw ratio | Reject in validator; inline inspector error; keep last valid |
| WebGL2 unavailable | Full-screen message; no WebGL1 fallback |
| Parallel ray / no hit | Null result; "no intersection" in inspector |
| Behind projector | Shader reject; zero coverage |
| Disabled projector | Skip all passes |
| Shader compile error | Console log + bottom-panel banner |
| Deferred feature control | Visible disabled state with milestone label |

---

## 12. Testing

### Vitest (M1)

| File | Tests |
|------|-------|
| `optics.test.ts` | Test 1 (nominal dims, FOV, density), Test 2 (lens shift), invalid input |
| `coverage.test.ts` | Test 3 (20° yaw footprint vs ray-plane reference) |
| `overlap.test.ts` | Test 4 stub (`describe.skip` until M3) |

### Playwright (M4)

Smoke: load app, viewport renders, throw ratio change updates readout.

### Manual M1 checklist

- 20° yaw → keystone distortion visible, no auto-correction
- Box occluder → shadow stable when editor camera moves
- Inspector values match Vitest for default scene

---

## 13. M1 Explicit Deferrals

- Image/video playback (M2)
- GLB/GLTF import (M2)
- Curved screens (M2)
- Multi-projector overlap & blending (M3)
- Raw vs shared-canvas mapping modes (M3)
- Save/load, CSV/HTML export (M2/M4)
- Undo/redo (M4)
- Visual transform gizmos (M4)
- Playwright smoke tests (M4)
- Brightness/lux estimates (optional, post-M1)

Deferred features must not appear as working controls.

---

## 14. M2–M4 Extension Points

| Concern | Extension |
|---------|-----------|
| Media | `TextureSource` interface; object URL lifecycle |
| GLB import | `ModelLoader` + scale confirmation dialog |
| Multi-projector | Iterate N depth passes; accumulate with blend weights |
| Shared-canvas | `MappingMode` enum; offscreen render-to-texture per projector |
| Blending | `BlendWeights.ts` pure functions; per-edge shader ramps |
| Persistence | `ProjectSerializer` v1 JSON; IndexedDB for asset blobs |
| Undo/redo | Command stack on sceneSlice mutations |
| RenderGraph | Promote sequential passes when 4-projector multipass needs it |

---

## 15. Deliverables (M1)

- Working source with dev/build/typecheck/test scripts
- README: install, usage, coordinate conventions, limitations
- Default single-projector sample scene
- Vitest passing for Tests 1–3
- Known limitations documented

---

## 16. Self-Review Checklist

- [x] No TBD placeholders
- [x] Architecture consistent with ProjectionLab.md
- [x] M1 scope bounded; deferrals explicit
- [x] Single optics source of truth stated
- [x] Lens shift convention documented
- [x] Editor camera vs projector separation explicit
- [x] Test mapping to acceptance criteria
