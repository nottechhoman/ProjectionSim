# Improvement plan — blending correctness & content canvas workflow

**Date:** 2026-09-16
**Branch:** `feat/reliability-shared-source-target`
**Restore point:** `backup-2026-09-16-pre-blend-canvas` → `ce50202`
**Reviewed docs:** `docs/PROJECTIONLAB_SUMMARY.md`, `docs/session-conclusions-2026-09-11.md`

---

## Part A — Is blending actually working? No.

Blend weights *are* computed, but the shader then cancels them out. Three separate
problems stack up, which is why Blend looks the same as Raw.

### A1. Normalization erases the soft edge (the main bug)

`src/projection/shaders/multiProjection.frag.glsl`:

```glsl
} else if (compositeMode == 1) {   // blended
  sumColor += color * w;
  sumWeight += w;
}
...
vec3 projected = compositeMode == 1 ? sumColor / sumWeight : sumColor;
```

Dividing by `sumWeight` turns the result into a **weighted average**, not a blend.

| Situation | Weights | Result | Expected |
|---|---|---|---|
| One projector, mid-feather | `w = 0.3` | `(0.3·c)/0.3 = c` → **full brightness** | `0.3·c` → visible ramp |
| Two projectors, matched ramps, same content | `0.7 / 0.3` | `c` (correct by luck) | `c` |
| Two projectors, ramps that *don't* sum to 1 | `0.3 / 0.3` | `c` — **artifact hidden** | dark band, must be visible |

Consequences:

- The soft-edge ramp is **never visible**, because any single-contributor fragment is
  re-normalized back to full brightness.
- The tool **cannot show a blend error**. A bright seam, dark band, or mismatched ramp —
  the exact things you use a blend planner to find — are mathematically impossible to
  display. Blend mode currently has no diagnostic value.

**Fix:** for `blended`, use the physical additive model, `projected = Σ(cᵢ · wᵢ)`, with no
normalization. Overlapping ramps that correctly sum to 1 then reconstruct full brightness
*because the weights are right*, not because the shader forced it.

### A2. Blend feather defaults to zero, and there is no auto-solve

`src/store/defaultScene.ts` and `src/store/index.ts`:

```ts
blendEdges: { left: 0, right: 0, top: 0, bottom: 0 },
outerEdgeFade: false,
```

So `rawBlendWeight()` returns `1.0` everywhere by default. Selecting **Blend** with two
projectors changes nothing until you hand-type feather fractions, per projector, per edge —
with no indication of how wide the real overlap is.

Meanwhile `computeAlignedOverlap()` in `src/coverage/overlap.ts` already computes exactly
what's needed and throws it away for this purpose:

```ts
overlapWidthM, percentOfA, percentOfB, overlapPixelsA, overlapPixelsB
```

**Fix:** an **Auto blend from overlap** action that derives each projector's inward-facing
feather from the measured pairwise overlap fraction.

### A3. Blending happens in sRGB output space, not linear light

`renderer.outputColorSpace = THREE.SRGBColorSpace`, and weights multiply
already-encoded pattern/media colors. Real soft-edge blending is a linear-light operation;
cross-fading encoded values produces a visible bright or dark seam even with perfect
geometry. Projector hardware exposes a blend gamma for precisely this reason.

**Fix:** apply the ramp with a `blendGamma` exponent (default ~2.2) so ramps combine in a
perceptually correct way, and expose it per projector.

### Workaround available today (before any code change)

1. Enable two projectors and set **Composite → Raw** first to see the true additive hot band.
2. Open the calculation panel and read **Projector 1 ∩ Projector 2 → % of A / % of B**.
3. Type that fraction into each projector's facing blend edge in the Inspector
   (e.g. 18% overlap → right edge `0.18` on the left projector, left edge `0.18` on the right one).
4. Switch to **Composite → Blend**. Today this mostly *hides* the seam rather than
   simulating it; treat the Raw view as the honest preview until Part A ships.

---

## Part B — The "make the material, then project it" workflow

Your instinct is right, and it matches how production tools (MadMapper, Resolume Arena,
Watchout, Pandoras Box, Disguise) are structured. What the app has today is **not** this.

### What `Mapping → Shared` actually does

`src/projection/sharedCanvasMapping.ts` samples **one designated projector's media** in
surface coordinates. It is "borrow projector N's content for the whole surface" — useful,
but not a canvas:

| Capability | Shared mapping today |
|---|---|
| Canvas with its own pixel resolution | No — inherits source projector's raster aspect |
| Multiple layers | No — single media/pattern |
| Per-layer transform (move / scale / rotate / crop) | No |
| Fit relative to the **surface** | No — `sharedFitMode` is projector-raster relative |
| See which projector covers which canvas region | No (raster preview is listed as Deferred) |
| Scales past 4 projectors | No — per-projector sampler slots |

### Proposed pipeline

```
┌──────────────────────────────────────────────────────────┐
│ 1. CONTENT CANVAS            e.g. 3840 × 1080 px         │
│    layers: image / video / pattern / solid               │
│    per layer: x, y, scale, rotation, opacity, fit, crop  │
│    rendered once per frame to an offscreen render target  │
└───────────────────────────┬──────────────────────────────┘
                            │  one canvas texture
┌───────────────────────────▼──────────────────────────────┐
│ 2. SURFACE MAPPING          canvas UV → surface UV        │
│    planar screen · curved arc-length · imported mesh UV   │
└───────────────────────────┬──────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────┐
│ 3. PROJECTOR SLICING        each projector samples the    │
│    canvas region its frustum covers (no per-projector     │
│    media needed — content is shared by construction)      │
└───────────────────────────┬──────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────┐
│ 4. BLEND & WARP             soft-edge ramps + gamma       │
│    (Part A math), optional keystone/warp later            │
└───────────────────────────┬──────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────┐
│ 5. COMPOSITE ON SURFACE     physical additive light       │
└──────────────────────────────────────────────────────────┘
```

Why this is the right move for this codebase specifically:

- **It fixes alignment by construction.** Content lives in surface space, so two projectors
  showing the same canvas region agree automatically — no per-projector fit juggling.
- **It removes the 4-projector sampler ceiling.** Today each projector needs its own
  `mediaMaps[i]` sampler slot; with one canvas texture, projector count is limited only by
  matrix uniforms.
- **It gives blending something meaningful to blend.** Ramps across a shared canvas are the
  real-world case; identical-content overlap is what soft edge exists for.
- **It unlocks the deferred raster preview.** Drawing each projector's frustum footprint as
  an outline *on the canvas* is the "window" you described, and it is the single most useful
  planning view the tool is missing.

### The new panel (the "window")

```
┌─ Content Canvas ──────────────────────────── 3840 × 1080 ─┐
│  ┌───────────────────────────────────────────────────┐    │
│  │ ·········· canvas preview ···················     │    │
│  │  ┌────────────────┐                               │    │
│  │  │  P1 footprint  ├───┬───────────────┐           │    │
│  │  └────────────────┘   │  P2 footprint │           │    │
│  │                       └───────────────┘           │    │
│  │            ↑ overlap band shown hatched           │    │
│  └───────────────────────────────────────────────────┘    │
│  Layers            ▸ bg-video     opacity 100  ⇅ move     │
│                    ▸ logo.png     opacity 100  ⇅ move     │
│  Canvas  W 3840  H 1080   Fit to surface ▾                │
└───────────────────────────────────────────────────────────┘
```

---

## Phased delivery

| Phase | Scope | Risk | Depends on |
|---|---|---|---|
| **1** | Blend math fix (A1), auto-blend from overlap (A2), blend gamma (A3) | Low — isolated to blend path | — |
| **2** | Content canvas store + offscreen canvas render target + shader sampling | Medium | 1 |
| **3** | Canvas panel UI with layers and projector footprint overlay | Medium | 2 |
| **4** | Per-projector raster preview, warp/keystone, >4 projectors | Higher | 2, 3 |

Phase 1 is a genuine bug fix and ships independently. Phases 2–4 are the workflow change
and should not be started until Phase 1 is verified, because both touch
`multiProjection.frag.glsl`.

---

## Acceptance criteria

### Phase 1

- With two projectors, matched feather, and identical content: overlap band brightness
  matches the non-overlap brightness within a small tolerance (no bright or dark seam).
- With two projectors and **mismatched** feather: a seam **is** visible — the simulation
  must be able to show the error.
- A single projector with feather shows a genuine brightness ramp toward the feathered edge.
- **Auto blend from overlap** sets facing edges from measured overlap and produces a clean
  seam without manual tuning.
- Existing 79 tests still pass; new unit tests cover ramp visibility, additive sum, and
  auto-blend derivation.

### Phases 2–3

- A canvas can be sized independently of any projector raster.
- Two projectors aimed at different parts of one screen show **one continuous image**.
- Projector footprints and the overlap band are drawn on the canvas preview.
- Existing Raw mapping behavior is unchanged when the canvas is not in use.

---

## Notes / constraints

- `renderer.debug.checkShaderErrors = true` is still enabled in `SceneEngine`; keep it while
  shader work is in flight — it is what surfaced the GLSL3 compile failure on 09-11.
- The multi shader is **GLSL 300 es**. Integer uniforms must be compared with integers
  (`== 1`, not `> 0.5`), and sampler array indices must be constant. Both rules caused the
  09-11 outage.
- The branch auto-deploys to GitHub Pages. Tag a restore point before every push.
