# ProjectionLab

Browser-based 3D projection planning simulator. Milestone 1 delivers a single-projector scene with throw-ratio optics, projective test-pattern rendering, planar footprint calculations, and occlusion shadows.

## Installation

Requires Node.js 18+ and a WebGL2-capable browser.

```bash
npm install
```

## Usage

```bash
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`).

### Default scene

The app loads with:

| Object | Position | Notes |
|--------|----------|-------|
| Screen | (0, 1.5, 0) | 6 × 3.375 m, receives projection, +Z normal |
| Floor | Y = 0 | 20 × 20 m, blocks projection |
| Projector | (0, 1.5, 6) | Throw ratio 1.5, 1920×1080, checkerboard pattern |

Select objects in the left panel. Edit position, rotation, and optics in the inspector. Use toolbar buttons for units, view presets, and adding box occluders.

Expected inspector readout for the default scene: **4.0 m × 2.25 m** projection at 6 m throw distance.

## Coordinate Conventions

- **Units:** 1 scene unit = 1 meter. Internal calculations use meters; the UI can display m, cm, or mm.
- **Handedness:** Right-handed, +Y up.
- **Projector forward:** Local −Z (optical axis).
- **Projector origin:** Lens optical center (projector body is a visual helper offset from this point).
- **Rotation:** Stored as quaternions; inspector exposes yaw, pitch, and roll in degrees using **YXZ** Euler order (yaw around Y, pitch around X, roll around Z).
- **Screen planes:** `PlaneGeometry` local +Z is the receiving face normal.
- **Areas:** m². **Angles:** degrees. **Density:** px/m and mm/px.

## M1 Features

- Metric scene editor with orbit camera and view presets (perspective, top, front, side)
- Single enabled projector with throw ratio, resolution, aspect ratio, and lens shift
- Off-axis perspective projection matrix shared by rendering and coverage math
- Test patterns: checkerboard, UV grid, color bars, white, projector ID
- Projective GLSL shader with depth-pass occlusion (shadows stable under editor camera movement)
- Planar footprint via ray–plane intersection (`computePlanarFootprint`)
- Nominal projection dimensions and pixel density in the inspector
- Optics validation with inline inspector errors (invalid throw ratio rejected)
- WebGL2 requirement check with full-screen fallback message

## Known Limitations

Features deferred to later milestones are disabled in the UI or stubbed in code:

| Feature | Milestone |
|---------|-----------|
| Image/video playback | M2 |
| GLB/GLTF import | M2 |
| Curved screens | M2 |
| Save/load projects, CSV/HTML export | M2/M4 |
| Multi-projector overlap and edge blending | M3 |
| Raw vs shared-canvas mapping modes | M3 |
| Undo/redo | M4 |
| Visual transform gizmos | M4 |
| Playwright smoke tests | M4 |
| Two-point measure tool | M4 |
| Footprint clipping to screen bounds (clipped area stub) | M2+ |
| Brightness/lux photometry estimates | Post-M1 |

This is a **planning and visualization tool**, not a calibrated photometric or hardware output system. It models ideal rectilinear pinhole optics only.

## Test Commands

```bash
npm test              # Vitest — Acceptance Tests 1–3 (Test 4 skipped until M3)
npm run test:watch    # Vitest watch mode
npm run typecheck     # TypeScript project references
npm run build         # Production build
```

### Acceptance tests (Vitest)

| Test | File | Description |
|------|------|-------------|
| 1 | `src/optics/optics.test.ts` | Nominal 4.0 × 2.25 m at D=6 m, density, invalid throw ratio |
| 2 | `src/optics/optics.test.ts` | Lens shift moves image center |
| 3 | `src/coverage/coverage.test.ts` | 20° yaw footprint matches ray–plane math |
| 4 | `src/coverage/overlap.test.ts` | Skipped — overlap (M3) |
