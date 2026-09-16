# Session conclusions — multi-projector fix & portable UI

**Branch:** `feat/reliability-shared-source-target`  
**Live site:** [https://nottechhoman.github.io/ProjectionSim/](https://nottechhoman.github.io/ProjectionSim/)  
**Date:** 11 September 2026  

This document summarizes work completed in this session: fixing projection surfaces when multiple projectors are active, pushing those changes online, and adding iPhone/iPad-oriented layout and performance optimizations.

---

## 1. Problem reported

When adding a second or third projector (Raw composite + Projection preview), the **projection surface disappeared** in the 3D viewport. Only the grid and projector blocks remained visible. Coverage calculations in the Calc panel still worked (e.g. ~67% visible), so the bug was in **rendering**, not in footprint math.

| Mode | Projectors | Result |
|------|------------|--------|
| Single-projector path | 1 | Screen visible (`projectiveMaterial`) |
| Multi path | 2+ | Screen not drawn (`multiProjectiveMaterial`) |
| Original preview | Any | Screen mesh still visible |

---

## 2. Root cause (multi-projector)

The multi-projector fragment shader **failed to compile** under WebGL2 / GLSL 300 es. Three.js then had no linked program for receiver meshes, so the screen was not drawn.

Contributing factors addressed in the fix:

1. **Invalid comparison:** `uniform int sharedUseMediaTexture` was compared with `> 0.5` (float). GLSL ES 3.0 rejects that; compile error: wrong operand types for `>`.
2. **GLSL1 vs GLSL3:** Multi shader needed migration to GLSL3 (`in`/`out`, `texture()`, `fragColor`) and **constant-index** sampler branches instead of dynamic `texture2D(mediaMaps[i], …)` / `depthMaps[i]`.
3. **Depth uniform binding:** `onBeforeRender` now fills a fixed-length `depthMaps` array instead of replacing the array reference; unused projector slots get `useMediaTexture[i] = 0`.

Evidence during debugging:

- `multiProjectiveMaterial.program` was effectively unusable with 2+ projectors.
- A minimal GLSL3 fragment proved the vertex path worked; the full shader failed until the `sharedUseMediaTexture` fix and related GLSL3 changes.

---

## 3. Multi-projector fix — changes

### Commits

| Commit | Message |
|--------|---------|
| `24b3ecc` | `fix: restore multi-projector projection surface rendering` |

### Backup tag (before shader fix)

- `backup-2026-09-11-pre-multi-shader-fix` → points at `f8ac18f`

### Files touched

| File | Role |
|------|------|
| `src/projection/shaders/multiProjection.frag.glsl` | GLSL3 multi-projector fragment; sampler unrolling; `sharedUseMediaTexture == 1` |
| `src/projection/shaders/multiProjection.vert.glsl` | **New** GLSL3 vertex shader for multi material |
| `src/projection/MultiProjectiveMaterial.ts` | `glslVersion: THREE.GLSL3`, multi vert shader, pad unused slots, safer depth fallbacks |
| `src/scene/SceneEngine.ts` | Depth map array copy in `onBeforeRender`; `preserveDrawingBuffer: true`; `checkShaderErrors: true` |

### Verification

- Manual: Front view, Raw composite, Projection preview — checkerboard/patterns on screen with 2–3 projectors.
- `npm run typecheck` — pass  
- `npm test` — 76 tests pass (at time of shader fix)

---

## 4. Deploy / push (shader fix)

Per project rules, a **restore tag** was created **before** pushing:

```text
git tag backup-2026-09-11-pre-multi-shader-fix f8ac18f
git push origin feat/reliability-shared-source-target
git push origin backup-2026-09-11-pre-multi-shader-fix
```

GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) deploys GitHub Pages on pushes to `feat/reliability-shared-source-target`, so the shader fix went live after this push.

---

## 5. Portable device optimization (iPhone & iPad)

### Request

Optimize the app for portable devices (e.g. iPhone Pro class phones and iPad sizes), **after** the previous fix was pushed online.

### Commit

| Commit | Message |
|--------|---------|
| `ce50202` | `feat: optimize layout and rendering for iPhone and iPad` |

### Backup tag (before mobile work)

- `backup-2026-09-11-pre-mobile-optim` → points at `24b3ecc` (shader fix on remote)

### New / updated behavior

**Layout & UX**

- **Device profiles:** `phone` (≤767px), `tablet` (768–1100px), `desktop` (>1100px) via `src/ui/deviceProfile.ts` and `useDeviceProfile.ts`.
- **Compact layout:** Side panels are not docked on phone/tablet; **slide-over drawers** for Scene and Inspector with backdrop dismiss.
- **Bottom navigation:** Scene | Viewport | Inspector on compact layouts.
- **Toolbar:** Horizontal scroll, larger touch targets on compact, safe-area padding.
- **HTML/CSS:** `viewport-fit=cover`, PWA-oriented meta tags, `100dvh`, safe-area insets, reduced overscroll.
- **Defaults on phone:** Scene and Inspector panels start **hidden** for a full viewport; panel widths scale with screen size.

**Rendering performance**

| Profile | Pixel ratio cap | Occlusion depth pass |
|---------|-----------------|----------------------|
| Phone | min(DPR, 1.5) | 256×256 |
| Tablet | min(DPR, 1.75) | 384×384 |
| Desktop | min(DPR, 2) | 512×512 |

- `SceneEngine` applies caps on resize (`syncRenderQuality()`).
- Orbit controls: damping enabled for smoother touch navigation; `touch-action: none` on canvas.

### Files touched (mobile)

| File | Role |
|------|------|
| `src/ui/deviceProfile.ts` | Breakpoints, pixel ratio, depth resolution, panel defaults |
| `src/ui/deviceProfile.test.ts` | Unit tests for profile helpers |
| `src/ui/useDeviceProfile.ts` | React hook listening to `resize` |
| `src/ui/App.tsx` / `App.module.css` | Drawer layout, mobile nav, compact grid |
| `src/ui/panels/Toolbar.tsx` / `Toolbar.module.css` | `compact` prop, scroll, touch sizing |
| `src/ui/panels/LeftPanel.module.css` / `Inspector.module.css` | Larger tap targets on narrow screens |
| `src/store/persistenceHelpers.ts` | Responsive default panel visibility/widths |
| `src/scene/SceneEngine.ts` | Adaptive pixel ratio and depth-pass size |
| `index.html` / `src/index.css` | Viewport meta, safe areas, `dvh` |

### Verification

- `npm run typecheck` — pass  
- `npm test` — 79 tests pass (includes `deviceProfile.test.ts`)

### Push

```text
git push origin feat/reliability-shared-source-target
git push origin backup-2026-09-11-pre-mobile-optim
```

---

## 6. How to reproduce / test locally

```bash
npm run dev
# http://localhost:5173/
```

**Multi-projector bug (fixed):**

1. Default scene → add 2+ projectors (`+ Projector`).
2. Composite **Raw**, Preview **Projection**, view **Front**.
3. Screen should show patterns/checkerboard, not empty grey grid only.

**Mobile layout:**

1. Resize browser below 768px or use device emulation (iPhone / iPad).
2. Use bottom **Scene / Viewport / Inspector**; panels open as drawers.
3. Toolbar scrolls horizontally; orbit with touch on the canvas.

**Optional debug (engine exposed in dev):**

- `window.__projectionLabEngine.readCanvasPixel(x, y)` (requires `preserveDrawingBuffer: true` on the renderer).

---

## 7. Restore points (tags)

| Tag | Points at | Purpose |
|-----|-----------|---------|
| `backup-2026-09-11-pre-multi-shader-fix` | `f8ac18f` | Before multi-projector GLSL3 / compile fix |
| `backup-2026-09-11-pre-mobile-optim` | `24b3ecc` | Before iPhone/iPad UI and render tuning |

To restore locally:

```bash
git checkout backup-2026-09-11-pre-multi-shader-fix   # or the mobile tag
```

---

## 8. Not done / follow-ups (optional)

- Playwright e2e for “2+ projectors → center pixel non-dark” was discussed; debug spec was removed; main e2e suite not extended in this session.
- `renderer.debug.checkShaderErrors = true` remains enabled in `SceneEngine` (helpful for dev; can be toned down for production if desired).
- iPad-specific UX (e.g. docked inspector on landscape only) can be refined if you want different defaults than phone.

---

## 9. Summary in one paragraph

We fixed multi-projector projection preview by migrating and correcting the multi-projector GLSL3 shader (especially `sharedUseMediaTexture == 1` and constant-index samplers), stabilized depth-map uniforms, pushed `24b3ecc` with backup tag `backup-2026-09-11-pre-multi-shader-fix`, then added phone/tablet layout (drawers, bottom nav, safe areas, touch-friendly toolbar) and adaptive GPU settings (pixel ratio and depth-pass resolution), pushed as `ce50202` with tag `backup-2026-09-11-pre-mobile-optim`, all on `feat/reliability-shared-source-target` for GitHub Pages deploy.
