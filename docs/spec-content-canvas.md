# Spec — Content Canvas (Phase 2 + 3)

**Date:** 2026-09-16
**Depends on:** Phase 1 (blend math fix) landing first — both touch `multiProjection.frag.glsl`
**Parent plan:** `docs/improvement-plan-blending-and-content-canvas.md`
**Restore point:** `backup-2026-09-16-pre-blend-canvas` → `ce50202`

Goal: author content once on a canvas, map it to the receiving surface, and let every
projector render its own slice — so multiple projectors show one continuous, aligned image
that follows surface UV.

---

## Key insight: most of the plumbing already exists

Both shaders already compute **surface-space content UV**. In
`projection.frag.glsl` and `multiProjection.frag.glsl`:

```glsl
vec2 sharedContentUv() {
  if (screenMapKind == 3) return vSurfaceUv;                    // imported mesh UV
  vec3 local = (screenMapMatrixInv * vec4(vWorldPos, 1.0)).xyz;
  if (screenMapKind == 1) {                                     // planar screen
    return vec2(local.x / screenMapParams.x + 0.5,
                local.y / screenMapParams.y + 0.5);
  }
  if (screenMapKind == 2) {                                     // curved arc
    float theta  = atan(local.z, local.x);
    float arcRad = screenMapParams.z * 0.01745329252;
    return vec2((theta + arcRad * 0.5) / arcRad,
                (local.y + screenMapParams.y * 0.5) / screenMapParams.y);
  }
  return vec2(0.0);
}
```

`SceneEngine.applyMappingUniforms()` already feeds `screenMapKind`, `screenMapMatrixInv`,
and `screenMapParams` for planar, curved, and mesh receivers.

**So the shader change is small.** What's missing is not the coordinate system — it's that
`sampleSharedContent()` currently samples *one designated projector's media*. Replace that
source with a composited canvas texture and the whole workflow falls out.

This is a **surgical change, not a rewrite.** Do not restructure the shaders.

---

## Data model

Add to `src/types/index.ts`:

```ts
export type ContentLayerKind = 'image' | 'video' | 'pattern' | 'solid';

export interface ContentCanvasLayer {
  id: string;
  name: string;
  kind: ContentLayerKind;
  mediaAssetId: string | null;   // image | video
  pattern: TestPattern | null;   // pattern
  color: string;                 // solid fill, or pattern tint
  /** Layer rect in canvas pixels, top-left origin. */
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  opacity: number;               // 0–1
  fit: MediaFitMode;             // contain | cover | stretch, within the layer rect
  visible: boolean;
}

export interface ContentCanvas {
  enabled: boolean;
  widthPx: number;
  heightPx: number;
  /** Render order: index 0 is the bottom layer. */
  layers: ContentCanvasLayer[];
}
```

Canvas UV `(0,0)–(1,1)` maps to the primary receiver's surface UV `(0,0)–(1,1)`. Keep that
1:1 for this phase — canvas-to-surface offset/zoom is a later addition. Note the canvas uses
a **top-left pixel origin** for authoring while surface UV is **bottom-left**; do the V flip
in exactly one place and add a unit test pinning the convention.

---

## Rendering: offscreen canvas composite

In `SceneEngine`, add a small dedicated compositor (suggested new file
`src/projection/ContentCanvasRenderer.ts` to keep `SceneEngine` from growing further):

- One `THREE.WebGLRenderTarget` sized to the canvas, one `THREE.OrthographicCamera`, one
  private `THREE.Scene`.
- One textured quad per visible layer, ordered back-to-front, using
  `mediaTextureCache` for image/video layers. Reuse `FIT_MODE_INT` / the existing
  `applyFit` logic so layer fit behaves like projector media fit.
- Render to the target once per frame **before** the main scene render, and only when the
  canvas is enabled. Videos need a refresh every frame; static layers do not, so track a
  dirty flag and re-render on change or when any layer is a playing video.
- Expose `texture: THREE.Texture`.

**Clamp the canvas size.** This must not regress the September 11 mobile work. Respect both
`renderer.capabilities.maxTextureSize` and the device profile in `src/ui/deviceProfile.ts`:

| Profile | Max canvas dimension |
|---|---|
| phone | 2048 |
| tablet | 3072 |
| desktop | 4096 |

Clamp to the smaller of the profile cap and `maxTextureSize`, and surface the effective size
in the UI so a clamped canvas is not silently different from what the user typed.

Dispose the render target and layer materials/geometries in `SceneEngine.dispose()` and
whenever the canvas is resized — the existing `dispose()` already tears down depth passes and
materials; follow that pattern.

---

## Shader change (small, and GLSL3-sensitive)

Add to **both** `projection.frag.glsl` and `multiProjection.frag.glsl`:

```glsl
uniform int useContentCanvas;
uniform sampler2D canvasMap;
```

In the shared-content sampling function, branch to the canvas first:

```glsl
if (useContentCanvas == 1) {
  if (contentUv.x < 0.0 || contentUv.x > 1.0 ||
      contentUv.y < 0.0 || contentUv.y > 1.0) return vec3(0.0);
  return texture(canvasMap, contentUv).rgb;
}
// ...existing per-projector media / pattern path unchanged
```

### Hard constraints — these caused a production outage on 2026-09-11

`multiProjection.frag.glsl` is **GLSL 300 es** (`glslVersion: THREE.GLSL3`):

1. **Never compare an `int` uniform to a float literal.** `uniform int foo; if (foo > 0.5)`
   fails to compile, and Three.js then silently draws nothing — the entire projection surface
   vanishes with no UI error. Use `== 1`. This exact mistake (`sharedUseMediaTexture > 0.5`)
   was the September 11 bug.
2. **Sampler array indices must be compile-time constant.** Follow the existing unrolled
   `sampleMediaAt` / `sampleDepthAt` helpers.
3. Use `in`/`out`, `texture()`, `fragColor` — not `varying`/`texture2D`/`gl_FragColor`.

`projection.frag.glsl` (single projector) is still **GLSL1** and uses `texture2D` /
`gl_FragColor`. Do not "modernize" it in this phase; match each file's existing dialect.

Keep `renderer.debug.checkShaderErrors = true` on. After any shader edit, verify
`window.__projectionLabEngine.multiProjectiveMaterial.program` is truthy with 2+ projectors.

---

## Projector footprints on the canvas

This is the payoff view — and the math already exists.

For each enabled projector:
1. `computePlanarFootprint()` (`src/coverage/planarFootprint.ts`) or
   `computeCurvedFootprint()` (`src/coverage/curvedFootprint.ts`) → world-space corners on
   the calculation target.
2. `worldToPlanarContentUv()` (already in `src/projection/sharedCanvasMapping.ts`) → surface
   UV per corner. Add the curved equivalent using the same `atan`/arc formula the shader uses,
   so the overlay and the render agree.
3. Surface UV → canvas pixels, applying the same V flip as the renderer.

Draw each footprint as an outline in the projector's own `PROJECTOR_PALETTE` color, and hatch
the pairwise overlap region. Keep this derivation pure and unit-tested — it must stay
consistent with the shader, or the overlay will lie.

---

## Canvas panel UI (Phase 3)

New panel, toggled from the toolbar. Do not disturb the existing Scene / Inspector / Status
layout or the compact drawer behavior added on September 11.

```
┌─ Content Canvas ──────────────────────── 3840 × 1080 ─┐
│  ┌─────────────────────────────────────────────┐      │
│  │        canvas preview (layers composited)   │      │
│  │  ┌────────────────┐                         │      │
│  │  │  P1 footprint  ├──┬──────────────┐       │      │
│  │  └────────────────┘  │ P2 footprint │       │      │
│  │                      └──────────────┘       │      │
│  │           ↑ overlap band hatched            │      │
│  └─────────────────────────────────────────────┘      │
│  Layers                                                │
│   ▸ bg-video    opacity 100  ▲▼  👁  ×                 │
│   ▸ logo.png    opacity 100  ▲▼  👁  ×                 │
│  + Image  + Video  + Pattern  + Solid                  │
│  Canvas  W [3840]  H [1080]   Enabled ☑                │
└────────────────────────────────────────────────────────┘
```

Implementation notes:

- Preview as a CSS-positioned stack with an **SVG overlay** for footprint outlines — easier
  than a 2D canvas for crisp outlines and future drag handles.
- Selecting a layer shows its transform fields; reuse `NumInput` and the existing
  `Inspector.module.css` conventions.
- Follow the compact/touch rules from `deviceProfile.ts`: ≥36 px targets on phone/tablet, and
  make sure the panel is reachable from the mobile bottom nav rather than assuming a
  desktop-only dock.
- Match existing CSS module patterns; do not introduce a new styling approach.

---

## Persistence

- Add `contentCanvas` to the project schema (`src/persistence/projectSchema.ts`) and
  serializer (`src/persistence/projectSerializer.ts`).
- **Legacy projects must keep loading.** Default missing `contentCanvas` to a disabled,
  empty canvas, following the existing `raw.X ?? DEFAULT_X` migration pattern used for
  `blendEdges` / `outerEdgeFade`.
- Include the canvas in autosave and in undo/redo history — canvas and layer edits should be
  undoable, using the existing `pushSceneHistoryCheckpoint` conventions in `src/store/index.ts`.
- Layer media references reuse the existing `mediaAssets` / IndexedDB blob mechanism; do not
  invent a second asset store.

---

## Acceptance criteria

1. A canvas can be sized independently of any projector raster (e.g. 3840×1080 with two
   1920×1080 projectors).
2. Two projectors aimed at different parts of one screen show **one continuous image**, with
   no per-projector media assignment.
3. Layers composite in order with correct opacity, fit, and transform.
4. Projector footprints and the pairwise overlap band are drawn on the canvas preview and
   agree with what the 3D viewport renders.
5. Canvas survives save → load → undo → redo. Projects saved before this feature still open.
6. **No regressions:** Raw mapping unchanged when the canvas is disabled; the projection
   surface still renders with 1, 2, 3, and 4 projectors; phone/tablet pixel-ratio and
   depth-pass caps still applied; existing tests still pass.
7. Canvas size is clamped on mobile and the effective size is visible to the user.

---

## Out of scope for this phase

- Warp / keystone / homography correction
- Raising `MAX_PROJECTORS` past 4 (the canvas makes it *possible* — do it separately)
- Canvas-to-surface offset and zoom (canvas fills the surface 1:1 for now)
- Per-projector output raster preview panel
- Photometric / lux modeling
