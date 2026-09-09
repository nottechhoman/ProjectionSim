# ProjectionLab — Project Summary

**Branch:** `feat/reliability-shared-source-target`  
**Last updated:** 2026-09-08  
**Stack:** React 19 · Three.js · Zustand · Vite · TypeScript · Vitest · Playwright

ProjectionLab is a browser-based 3D projection planning simulator. It lets you place projectors, screens, and occluders in a metric scene, preview projected content with realistic lens geometry, calculate footprints and overlap, and export planning reports.

---

## Quick Start

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # 56 Vitest tests
npm run test:e2e   # 4 Playwright smoke tests
npm run build      # Production build
```

If the browser shows `ERR_CONNECTION_REFUSED`, the dev server is not running — start it with `npm run dev`.

---

## Milestones Overview

| Milestone | Focus | Status |
|-----------|-------|--------|
| **M1** | Single projector, optics, planar footprint, occlusion | Done |
| **M2** | Media, GLB import, curved screens, save/load | Done |
| **M3** | Multi-projector overlap, blending, composite modes | Done |
| **M4** | Undo/redo, measure, reports, panel UX, E2E tests | Done |
| **Post-M4** | Curved beam, curved overlap, shared-canvas mapping | Done |
| **Reliability** | Explicit shared content source and calculation target | Done |
| **Coverage reliability** | Sampled geometric/visible coverage, occlusion, reports | Done |

---

## Feature List

### Scene & Editor (M1)

- Metric 3D editor with orbit camera and view presets (perspective, top, front, side)
- Click-to-select objects; Move/Rotate gizmo (toolbar or `W` / `E` keys)
- Collapsible Scene, Inspector, and Status panels
- WebGL2 requirement check with full-screen fallback message
- Coordinate system: right-handed, +Y up, 1 unit = 1 meter

### Optics & Coverage (M1)

- Throw ratio, resolution, aspect ratio, lens shift
- Off-axis perspective projection matrix (shared by rendering and math)
- Planar footprint via ray–plane intersection
- Nominal projection dimensions and pixel density in inspector
- Optics validation with inline errors

### Media & Import (M2)

- Assign images or videos to projectors (contain / cover / stretch)
- GLB/GLTF/OBJ import with scale confirmation
- Video transport in status bar: play/pause, seek, mute, loop
- Project persistence v2: `.projectionlab.json` + IndexedDB blobs
- Autosave to localStorage every 2 seconds

### Surfaces (M2–M4)

- Flat screens, curved cylindrical screens, floors, boxes, imported models
- Per-object flags: receives projection / blocks projection / **projection sides** (front, back, or both — flat screens, floors, curved screens)
- Material preview modes: **Projection**, **UV**, **Original**
- Curved-screen beam footprint with arc outline (yellow frame)
- Footprint clipping to screen bounds (planar)

### Multi-Projector (M3)

- Up to 4 projectors, each with independent optics, media, color, transform
- Composite modes: **Solo**, **Raw** (additive), **Blend** (edge weights), **Coverage Count** (overlap count heatmap — not lux)
- Per-edge blend feathering (left/right/top/bottom in projector UV space)
- Overlap calculations:
  - **Planar screens** — pairwise area, union, multi-coverage, horizontal overlap, overlap pixels
  - **Curved screens** — same stats mapped to arc-length × height space on the cylinder

### Mapping Modes (Post-M4)

| Mode | Behavior |
|------|----------|
| **Raw** | Each projector samples its own raster UV. Rotating a projector visibly distorts content. |
| **Shared** | Content is sampled in screen/curved-surface coordinates. Overlapping projectors show aligned imagery. |

Toolbar: **Mapping → Raw / Shared**

When **Shared** is active, a **Shared content source** dropdown lists all projectors by name. The chosen projector owns the media/pattern used for shared mapping. This is independent of the currently selected object. **Disabled projectors may remain the content source** — content ownership is separate from projection participation.

### Reliability Settings

| Setting | Location | Behavior |
|---------|----------|----------|
| **Shared content source** | Toolbar (when Mapping = Shared) | Explicit projector ID for shared-canvas media/pattern. Unaffected by object selection. |
| **Calculation target** | Inspector → Calculation target | Explicit flat or curved screen for footprint/overlap math. Unaffected by object selection. |

**Migration (legacy projects without these fields):**
- Shared content source defaults once to the saved selected projector, else first projector.
- Calculation target defaults once to legacy auto-pick (curved screen before flat).

**Fallback when a setting becomes invalid:**
- Shared content source → first projector in the list.
- Calculation target → first flat screen with `receivesProjection`, else first curved screen.

Both settings persist in project files, autosave, and undo/redo history.

### Coverage Reliability (sampled analysis)

Area-weighted surface sampling on the **calculation target** (flat or curved screen). Distinct from analytic pairwise overlap metrics above.

| Metric | Definition |
|--------|------------|
| **receiverArea** | Total analyzed receiving surface area (sum of sample weights). |
| **geometricCoveredArea** | Area inside ≥1 enabled projector frustum before occlusion. |
| **visibleCoveredArea** | Area reached by ≥1 enabled projector after occlusion along lens→sample rays. |
| **uncoveredArea** | `receiverArea − visibleCoveredArea`. |
| **visibleOverlapArea** | Area reached by ≥2 projectors after occlusion (counted once; not summed pairwise). |
| **occlusionLossArea** | Geometrically covered but not visible after occlusion. |

Per-projector: geometric covered, visible covered, blocked area.

**Eligibility:** enabled projectors with valid optics. Geometric metrics ignore blend weights and content brightness.

**Sampling presets** (Inspector → Sampling quality):

| Preset | Resolution (U×V) |
|--------|-------------------|
| Draft | 32×18 |
| High | 64×36 |

**Occlusion:** only objects with `blocksProjection=true` (box, floor, flat screen, curved screen). Imported meshes are not occluders in sampling. Endpoint tolerance avoids self-hit at the sample point (`1 mm` absolute or `0.01%` of ray length). Receivers with `blocksProjection` can block other surfaces.

**Numerical tolerances (tests):** 12% relative area tolerance for draft vs high convergence; 3% for identical-projector overlap assertions.

**Rendering vs calculation:** Both use `blocksProjection` objects for occlusion. Receivers are excluded from the WebGL depth pass to prevent self-occlusion in preview; sampling uses endpoint tolerance instead. A screen with `blocksProjection=true` occludes in both preview and sampled visible coverage.

Reports (CSV/HTML) include target, sampled metrics, definitions, sampling resolution, projector optics/position, and lens-shift convention.

### Dual-sided projection

Thin surfaces (flat screen, floor, curved screen) support **Projection sides** in the Inspector:

| Setting | Preview behavior | Calculation |
|---------|------------------|-------------|
| **Front only** | Mesh front face receives projection | Samples front face (+Z for screens, +Y for floors, concave interior for curved) |
| **Back only** | Mesh back face receives projection | Samples reverse face |
| **Both sides** | Both faces receive projection | Use **Analyze side** in calculation panel: Front / Back / Both (combined) |

Preview uses mesh winding (`gl_FrontFacing`). Curved screens treat the **concave interior** as the front face in calculations (typical cinema layout). Legacy projects default to front-only.

### Panel UX (M4)

- Resizable Scene and Inspector panels (160–560 px), persisted in project/autosave
- Pop-out panels: float Scene or Inspector over the viewport in the same tab; drag to move, dock to restore

### Tools (M4)

- **Undo/redo** — `Ctrl+Z` / `Ctrl+Shift+Z` for scene edits
- **Measure** — two-point distance tool (`M` to toggle)
- **Beam** — toggle lens-to-corner rays and yellow footprint outline
- **Reports** — export calculation results as CSV or HTML

### Projection Visibility Fixes (Post-M4)

- Receiving surfaces keep their base material outside the projected region
- Receivers excluded from depth pass (only `blocksProjection` objects occlude) — fixes self-occlusion
- Always-on yellow footprint frame on receiving surfaces when footprint can be computed

---

## Default Scene

| Object | Position | Notes |
|--------|----------|-------|
| Screen | (0, 1.5, 0) | 6 × 3.375 m, receives projection, +Z normal |
| Floor | Y = 0 | 20 × 20 m, blocks projection |
| Projector | (0, 1.5, 6) | Throw ratio 1.5, 1920×1080, checkerboard |

Expected inspector readout: **4.0 m × 2.25 m** projection at 6 m throw distance.

---

## Sample Projects

Open via **Open** in the toolbar:

| File | Description |
|------|-------------|
| `samples/two-projector-blend.projectionlab.json` | Two projectors with edge blend on a flat screen |
| `samples/curved-screen.projectionlab.json` | Flat screen plus curved receiving surface |

### Suggested workflows

1. **Two-projector blend** — load blend sample → add second projector if needed → try **Mapping → Shared** + **Composite → Blend**
2. **Curved screen** — load curved sample → enable **Beam** → check yellow arc outline on curved surface
3. **Overlap stats** — open calculation panel with two projectors enabled on flat or curved primary receiver

---

## Coordinate Conventions

- **Units:** meters internally; UI can display m, cm, or mm
- **Handedness:** Right-handed, +Y up
- **Projector forward:** Local −Z (optical axis)
- **Projector origin:** Lens optical center
- **Rotation:** Quaternions internally; inspector shows Rotation X/Y/Z in degrees (YXZ Euler)
- **Screen planes:** `PlaneGeometry` local +Z is the receiving face normal
- **Areas:** m² · **Angles:** degrees · **Density:** px/m and mm/px

---

## Architecture

### Key directories

```
src/
├── optics/           # Throw ratio, projection matrix, ray unprojection
├── coverage/         # Planar/curved footprints, overlap, clipping, sampled coverage
├── projection/       # GLSL shaders, projective materials, shared-canvas mapping
├── blending/         # Edge blend weight functions
├── scene/            # SceneEngine, object factories, FrustumHelper
├── store/            # Zustand state, history, persistence helpers
├── persistence/      # Project serializer, autosave, report export
├── media/            # Texture cache, asset import, model loader
└── ui/               # App, panels, toolbar, viewport
```

### Important files

| Area | Path |
|------|------|
| Scene render loop | `src/scene/SceneEngine.ts` |
| Beam / footprint outline | `src/scene/helpers/FrustumHelper.ts` |
| Planar footprint | `src/coverage/planarFootprint.ts` |
| Curved footprint | `src/coverage/curvedFootprint.ts` |
| Planar overlap | `src/coverage/overlap.ts` |
| Curved overlap | `src/coverage/curvedOverlap.ts` |
| Sampled coverage analysis | `src/coverage/coverageAnalysis.ts`, `src/coverage/occlusion.ts` |
| Shared-canvas mapping | `src/projection/sharedCanvasMapping.ts` |
| Single-projector shader | `src/projection/shaders/projection.frag.glsl` |
| Multi-projector shader | `src/projection/shaders/multiProjection.frag.glsl` |
| App state | `src/store/index.ts` |
| Panel layout | `src/ui/panelLayout.ts`, `FloatingPanel.tsx` |
| Calculation reports | `src/persistence/reportExport.ts` |
| E2E tests | `e2e/smoke.spec.ts` |

### Calculation behavior

`recomputeCalculations` uses the **explicit calculation target** (`calculationTargetId`), not the selected object. Footprint/overlap for the selected projector are computed against that target. **Sampled coverage analysis** (`coverageAnalysis`) uses the same target plus `analysisQuality`. Results include `calculationTarget` name and type; CSV/HTML reports include the target and sampled metrics.

Shared-canvas **rendering** still uses `resolveSharedCanvasSupport()` for surface UV mapping (primary receiver for mapping). This is intentionally separate from the calculation target.

---

## Tests

### Vitest (56 tests)

| Test | File | Description |
|------|------|-------------|
| 1 | `src/optics/optics.test.ts` | Nominal 4.0 × 2.25 m at D=6 m, density, invalid throw ratio |
| 2 | `src/optics/optics.test.ts` | Lens shift moves image center |
| 3 | `src/coverage/coverage.test.ts` | 20° yaw footprint matches ray–plane math |
| 4 | `src/coverage/overlap.test.ts` | Pairwise overlap, union, triple-region math |
| 4 | `src/coverage/curvedOverlap.test.ts` | Curved-screen overlap for dual projectors |
| 4 | `src/projection/sharedCanvasMapping.test.ts` | Shared-canvas screen UV mapping |
| R | `src/store/reliabilitySettings.test.ts` | Source/target resolution and fallback |
| R | `src/store/reliabilityState.test.ts` | Store selection independence, undo, serialization |
| CR | `src/coverage/coverageAnalysis.test.ts` | Sampled geometric/visible coverage, occlusion, curved, convergence |
| 5 | `src/blending/blendWeights.test.ts` | Blend weights sum to 1; no double brightness |

Additional unit tests: `clipFootprint`, `curvedFootprint`, `history`, `reportExport`, `projectSerializer`.

### Playwright

`e2e/smoke.spec.ts` — app shell, panels, reliability regression (shared source + calculation target stable across selection), and visible coverage blocker scenario.

---

## Recent Commits (newest first)

| Commit | Description |
|--------|-------------|
| `22ade64` | Shared-canvas mapping mode for aligned projection |
| `d5eabd5` | Curved-screen overlap calculations |
| `562d4ec` | Curved-screen beam footprint and arc outline |
| `731fb8c` | Beam uses footprint corners on screen plane |
| `aaaeca2` | Projection visibility fix, beam helper, video transport, footprint clip |
| `721b236` | M4: undo, measure, reports, Playwright smoke tests |
| `a975040` | Resizable and pop-out scene/inspector panels |
| `d7e5a19` | M3: multi-projector overlap and blending |

### Restore tags

Annotated tags for rollback:

- `backup-2026-09-07-pre-m2`
- `backup-2026-09-07-pre-m3`
- `backup-2026-09-07-pre-m4`
- `backup-2026-09-07-pre-panel-ux`
- `backup-2026-09-07-pre-projection-ux`
- `backup-2026-09-08-pre-curved-overlap`

---

## Known Limitations

| Feature | Status |
|---------|--------|
| Per-projector raster preview panel | Deferred |
| Brightness/lux photometry estimates | Deferred |
| Curved footprint area (analytic beam) | Approximate (`radius × arcSpan × heightSpan`) |
| Sampled coverage accuracy | Resolution-dependent; no guaranteed error bound |
| Imported mesh occluders in sampling | Not supported |
| Shared-canvas on imported meshes | Uses mesh UV when model is the primary receiver |
| Digital warp / homography correction | Not implemented (separate from lens shift) |

This is a **planning and visualization tool**, not a calibrated photometric or hardware output system. It models ideal rectilinear pinhole optics only.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `W` | Move gizmo |
| `E` | Rotate gizmo |
| `M` | Toggle measure tool |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |

---

## Deployment

The project is configured for **Netlify** deployment. See `netlify.toml` and the Netlify skills in the workspace rules for build/deploy guidance.

---

## Related Docs

- Design spec: `docs/superpowers/specs/2026-09-07-projectionlab-design.md`
- M1 plan: `docs/superpowers/plans/2026-09-07-projectionlab-m1.md`
- Full product spec: `ProjectionLab.md`
