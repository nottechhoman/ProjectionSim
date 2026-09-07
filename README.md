# ProjectionLab

Browser-based 3D projection planning simulator. Milestone 1 delivers a single-projector scene with throw-ratio optics, projective test-pattern rendering, planar footprint calculations, and occlusion shadows. Milestone 2 adds image/video media on projectors, GLB/GLTF/OBJ import, curved screens, material preview modes, and versioned project save/load with IndexedDB asset storage. Milestone 3 adds up to four projectors with overlap calculations, edge blending, and composite preview modes (raw additive, blended, heatmap). Milestone 4 adds undo/redo, a two-point measure tool, CSV/HTML calculation reports, resizable and pop-out panels, and Playwright smoke tests.

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

Select objects in the left panel or click them in the viewport. Edit position, rotation, and optics in the inspector. Use the Move/Rotate gizmo (toolbar or W/E keys) to transform selected objects.

**Import** accepts images, videos, and GLB/GLTF models. **Curved Screen** adds a cylindrical receiving surface. Assign media to a projector in the inspector (Media source section). Toggle **Projection / Original** preview in the toolbar to see projected texture vs. base materials.

**New / Open / Save** writes `.projectionlab.json` project files. Media blobs are stored in IndexedDB and rehydrated on load. The app also autosaves to browser localStorage every 2 seconds.

Use **+ Projector** to add up to four projectors. Offset them horizontally and use **Raw / Blend / Heatmap** composite modes when two or more are enabled. Per-projector blend edge feathering is in the inspector.

Expected inspector readout for the default scene: **4.0 m × 2.25 m** projection at 6 m throw distance.

## Coordinate Conventions

- **Units:** 1 scene unit = 1 meter. Internal calculations use meters; the UI can display m, cm, or mm.
- **Handedness:** Right-handed, +Y up.
- **Projector forward:** Local −Z (optical axis).
- **Projector origin:** Lens optical center (projector body is a visual helper offset from this point).
- **Rotation:** Stored as quaternions; inspector exposes **Rotation X / Y / Z** in degrees (local axes, YXZ Euler order internally).
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
- 3D transform gizmo (move/rotate), click-to-select, editable numeric inspector fields
- Collapsible scene, inspector, and status panels

## M2 Features

- **Media on projectors** — assign imported images or videos; fit modes (contain, cover, stretch)
- **GLB/GLTF/OBJ import** — load 3D models with scale confirmation prompt
- **Curved screens** — cylindrical receiving surfaces for projection preview
- **Material preview modes** — Projection (projective overlay) vs. Original (base materials)
- **Surface flags** — per-object receives projection / blocks projection toggles
- **Video playback** — play/pause control in the status bar when a video is assigned
- **Project persistence v2** — JSON project files + IndexedDB blob storage for media assets; v1 projects load with defaults
- **Autosave** — localStorage snapshot every 2 seconds

## M3 Features

- **Multiple projectors** — up to 4, each with independent optics, media, color, and transform
- **Composite preview modes** — Raw (additive), Blend (normalized edge weights), Heatmap (overlap count)
- **Per-edge blend controls** — left/right/top/bottom feather in projector UV space
- **Overlap calculations** — pairwise area, union, multi-coverage, horizontal overlap, overlap pixels (planar screens)
- **Acceptance Tests 4 & 5** — overlap union math and blend weight normalization

## M4 Features

- **Undo/redo** — scene edit history for objects, projectors, and media assignments (`Ctrl+Z` / `Ctrl+Shift+Z`)
- **Two-point measure tool** — click two points in the viewport to measure metric distance (`M` to toggle)
- **Calculation reports** — export CSV or printable HTML from toolbar buttons
- **Resizable panels** — drag Scene and Inspector edges (160–560 px)
- **Pop-out panels** — float Scene or Inspector over the viewport in the same tab; drag header to move, dock to restore
- **Playwright smoke tests** — basic load and panel visibility checks
- **Projection beam helper** — toolbar **Beam** shows frustum to calculated image size with footprint rectangle
- **Receiving surface visibility** — objects keep their base material outside the projected region
- **Footprint clipping** — clipped area on screen bounds (planar screens)
- **Video transport** — seek bar, mute, and loop controls in the status bar when a video is assigned

### Sample projects

Open from the `samples/` folder via **Open** in the toolbar:

| File | Description |
|------|-------------|
| `samples/two-projector-blend.projectionlab.json` | Two projectors with edge blend on a flat screen |
| `samples/curved-screen.projectionlab.json` | Single projector on a flat screen plus curved receiving surface |

## Known Limitations

Features deferred to later milestones are disabled in the UI or stubbed in code:

| Feature | Milestone |
|---------|-----------|
| Curved screen footprint / overlap calculation | M3+ (preview works; calc panel planar only) |
| Shared-canvas mapping mode | M3+ |
| Video seek/loop/mute timeline | Done (status bar transport) |
| Footprint clipping to screen bounds (clipped area stub) | Done (planar clip) |
| Brightness/lux photometry estimates | Post-M1 |

This is a **planning and visualization tool**, not a calibrated photometric or hardware output system. It models ideal rectilinear pinhole optics only.

## Test Commands

```bash
npm test              # Vitest — Acceptance Tests 1–5 + M4 unit tests
npm run test:watch    # Vitest watch mode
npm run test:e2e      # Playwright smoke tests (starts dev server)
npm run typecheck     # TypeScript project references
npm run build         # Production build
```

### Acceptance tests (Vitest)

| Test | File | Description |
|------|------|-------------|
| 1 | `src/optics/optics.test.ts` | Nominal 4.0 × 2.25 m at D=6 m, density, invalid throw ratio |
| 2 | `src/optics/optics.test.ts` | Lens shift moves image center |
| 3 | `src/coverage/coverage.test.ts` | 20° yaw footprint matches ray–plane math |
| 4 | `src/coverage/overlap.test.ts` | Pairwise overlap, union, triple-region math |
| 5 | `src/blending/blendWeights.test.ts` | Blend weights sum to 1; no double brightness |
