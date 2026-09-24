# NAPT Advanced (v2) — UV Mapping & Edge Blending

This folder is a **separate copy** of `ProjectionSim` (the original is untouched). It keeps every
v1 feature and adds a production-style mapping and blending toolset. It stores its autosave and
media under different browser keys (`projectionlab-advanced-autosave-v1`,
`projectionlab-advanced-assets`), so v1 and v2 can run side by side without overwriting each other.
Project files stay format version 2: v2 can open v1 files, and v1 opens v2 files but ignores the new fields.

```bash
npm install        # or reuse the copied node_modules
npm run dev        # http://localhost:5173
npm test           # Vitest (137 tests, incl. 28 new v2 tests)
npm run test:e2e   # Playwright (adds e2e/advanced.spec.ts)
```

Open **✦ Studio** in the toolbar (on phone and tablet: **Studio** in the bottom bar). It has three tabs.

---

## 1. Edge Blend

| Control | What it does |
|---|---|
| **Mode: Manual feathers** | v1 behaviour: per-projector left/right/top/bottom feathers from the Inspector. |
| **Mode: Auto (geometry)** | New. Each projector that actually reaches a surface point gets an edge score, based on how far that point is from the edge of its (warped) image. The scores are normalised so they **sum to exactly 1**. Occluded projectors don't take part. This works for any overlap shape: curved screens, rotated or keystoned projectors, and 3- or 4-way corners. |
| Curve | Linear, smoothstep, cosine, or power (quadratic) ramp shape. |
| Ramp width | How far in from the image edge the ramp reaches (1 = to the image centre). |
| Sharpness | Exponent on the edge scores. Higher values give a narrower, harder crossover. |
| **Gamma-correct mask** | When on, the mask is pre-compensated (signal = w^(1/γ)) so the light adds up to 1. Turn it off to see the classic dark band you get when a linear mask is sent to a γ 2.2 projector. |
| **Black level** | Simulates the light a projector leaks when it shows black. Overlaps get a brighter "black". |
| **Black-level compensation** | Lifts black in the non-overlap areas to match the deepest overlap. |
| Crossover chart | Live plot of both projectors' light and their sum. A flat white line means seamless. |
| Uniformity on target | CPU sampling of the calculation target using the same maths as the shader: % of area within ±2 %, worst seam error, and maximum overlap. |
| **Blend Σ heatmap** | Viewport preview of the summed light weight: green = seamless, blue = dark seam, red = hot seam. Also in the toolbar under Preview. |
| **Export** | Downloads a **blend mask PNG** per projector (signal space, native resolution up to 4096 px, ready for a media server) and a **projector feed PNG** (content × mask). The Output panel also has Feed ⤓ and Mask ⤓ buttons for each projector. |

The Output panel now renders every projector's feed with the same shader as the viewport. The
feeds include the per-surface UV mapping, the warp, and auto-blend weights (which depend on every
other projector).

## 2. UV Mapping (per surface)

In **Shared** mapping mode (or when the content canvas is on), each receiving object can have its
own UV mapping into the shared content:

* **Projection**: mesh UV (from the geometry, including imported GLB/OBJ UVs), planar (fitted to
  the box, picks the facing axis), cylindrical (fitted to the arc, reads left to right from the
  concave side of a curved screen), or spherical.
* **Region**: which rectangle of the content this surface shows. Drag it in the 2D UV editor
  (drag corners to resize, Shift snaps to 5 %) or type the values.
* Rotate, flip U/V, repeat U/V, and wrap (clamp, repeat, or mirror).
* The editor draws the selected surface's UV wireframe inside its region.
* **Auto-layout side by side** splits the content evenly across all surfaces.
* The **Surface UV** preview (toolbar or Studio) draws a UV grid on every surface.

Surfaces with mapping turned off keep the v1 "primary receiver" shared mapping, so old projects
look exactly the same.

## 3. Warp (corner pin / keystone)

* A per-projector 4-corner homography. The dashed box is the physical raster and the coloured quad
  is where the image lands inside it. Drag the corners (Shift snaps) or type them.
* **Fit to calculation target** projects the flat or curved target's corners into the projector
  raster and pins the image to them. If the target extends past the raster, the corners are
  clamped.
* Light outside the quad is black. Raw-mode content and the blend edges follow the warped image,
  so auto blend stays seamless with keystoned projectors.

## 4. Outputs (full screen on other displays)

**⧉ Outputs** in the toolbar (or Studio → Outputs) sends each projector's output to a real
display, the way media servers do.

1. Connect the projectors or displays and set them to **Extended** (not Mirrored) in your
   operating system's display settings. Set each display to its projector's resolution.
2. Click **Detect displays**. Chrome and Edge ask once for *Window management* permission, then
   list every display by name, resolution and scale. External displays are pre-assigned to
   projectors in order.
3. For each projector choose the **Display** and what to **Send**:
   * **Projector feed**: exactly what that projector should receive (surface UV mapping,
     corner-pin warp and blend mask) at native resolution, or at half resolution to save GPU.
   * **Blend mask only**: the signal-space mask, for checking or for a hardware blender.
   * **Alignment grid**: 10 % grid, centre cross, circles and the projector name, for
     physical lens and position alignment.
4. Click **Open output** (or **Open all outputs**). With display access granted, the window
   opens on the chosen display and goes full screen. Otherwise, press **F** or double-click
   inside it.

Inside an output window: **F** or double-click = full screen, **Esc** = exit, **I** = identify
overlay (name, resolution, display, fps). The cursor hides after 2.5 s. The outputs keep
updating even when the main window is hidden behind them.

How it works: each output is a pop-up window with one canvas. The main window renders the feed
on the GPU at native resolution, copies it through a non-blocking pixel buffer (one frame of
latency), and paints it into the window. Browser notes: picking a display by name needs Chrome
or Edge. Safari and Firefox open a normal window that you drag to the projector display. Some
browsers allow only one new window per click, so **Open all outputs** may need pop-ups allowed
for the site.

## New test patterns

**Black** (checks black level and compensation) and **Gray 50 %** (makes seams easy to see in
overlaps; white saturates).

## Samples (`samples/`, also in `public/samples/`)

| File | Shows |
|---|---|
| `advanced-curved-autoblend.projectionlab.json` | 120° curved screen, 3 projectors, cylindrical UV, auto blend (100 % uniform) |
| `advanced-multi-surface-uv.projectionlab.json` | Screen + two plinths, each showing a different region of the content, 2-projector auto blend |

## Architecture notes

* `src/projection/shaders/multiProjection.frag.glsl` is now the single compositing shader for
  1–4 projectors. The single-projector path uses it too, and renders pixel-identical to v1 on the
  bundled samples. It evaluates a hit pass, a weight pass and a composite pass, plus a feed mode
  used for projector outputs and mask export.
* CPU mirrors of the shader maths, all unit-tested:
  `src/blending/advancedBlend.ts`, `src/blending/blendAnalysis.ts`,
  `src/uvmapping/surfaceUv.ts`, `src/warp/homography.ts`.
* `src/projection/ProjectorFeedPass.ts` renders feeds and masks from each projector's camera.
* `src/ui/panels/StudioPanel.tsx` is the Studio UI.
* Per-mesh uniforms (surface mapping, base colour, sides) now set `uniformsNeedUpdate`. This fixes
  a v1 issue where a shared material only uploaded the first mesh's per-mesh values.
* New state is persisted and undoable: `blendSettings` (global), `ProjectorConfig.warp`, and
  `SceneObject.uvMapping`.

## Limitations

* Blend uniformity sampling ignores occlusion. Use the Blend Σ viewport preview for occluded
  scenes.
* Auto blend uses a rectangular edge score in each projector's image space. That is a standard
  distance-weighted blend, not an optimised photometric solve.
* The black-level model is additive and uniform. It doesn't include per-projector colour or
  vignetting.
* `vite.config.ts` still uses the `/ProjectionSim/` GitHub Pages base for `--mode pages`. Change it
  if you deploy this copy to a different repository.
