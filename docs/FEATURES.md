# Projection Simulator — Complete Feature Record (v1 → v9)

> **What this is:** a self-contained record of everything the Projection Simulator does, which
> version added each feature, and what is known to be missing. It is written so a reader with no
> prior context (a person or an AI model) can understand the tool.
>
> **中文簡介：** 呢份係 Projection Simulator 由最原本嘅版本（v1–v3）到而家（v9）所有功能嘅完整紀錄，
> 每樣功能都標明係邊個版本加入，最尾有已知缺口。內文用英文寫，方便任何人或者 AI 直接讀。
>
> Compiled 2026-10-15 from the repository history (github.com/nottechhoman/ProjectionSim),
> the per-version notes `docs/v4.md` … `docs/v9.md`, `ADVANCED.md`, `docs/PROJECTIONLAB_SUMMARY.md`,
> and the project's own notes. Status is as of v9 (merged 2026-10-14).

---

## 1. The tool in one paragraph

Projection Simulator is a browser-based 3D projection planning and playback tool (React 19,
Three.js, Zustand, Vite, TypeScript). You build a metric stage (screens, curved screens, floors,
boxes, LED walls, imported 3D models), hang up to four projectors with real throw ratios, lens
shift and real projector/lens models, and see exactly what lands where: footprint, overlap, edge
blends, spill, shadows, brightness in nits/lux and pixel density. On top of that sits a
disguise-style media server: content lives on layers, layers are sampled through reusable
mappings, and a timeline with sections, cues and GO plays it back, controllable by MIDI, MIDI
timecode and OSC. Each projector's real output can be sent full screen to a physical display.
It also has a simplified phone viewer and installs as an offline-capable web app.

- **Live site:** https://nottechhoman.github.io/ProjectionSim/ (GitHub Pages, deployed from
  branch `feat/reliability-shared-source-target`; the repo has no `main`).
- **Best browser:** Chrome (needed for Web MIDI, display picking and the OSC bridge connection).
- It is a planning and visualisation tool, not a calibrated photometric instrument: optics are
  ideal rectilinear pinhole lenses.

## 2. Version history at a glance

| Version | Dates | Name at the time | Where | Headline |
|---|---|---|---|---|
| **v1** (original) | 2026-09-07 → 09-16 | ProjectionLab → "Not a Projection Tool (NAPT)" | deploy branch, commits `0de9caa`…`5e6b5b4` | 3D scene, optics, footprint, occlusion, 1–4 projectors, overlap, blending, reports, content canvas, LED walls, mobile layout |
| **v2** Advanced (original) | 2026-09-24 | NAPT Advanced | branch `feat/advanced-v2`, commit `b3f1f32` | Studio: auto edge blend, gamma/black level, UV mapping per surface, corner-pin warp, full-screen outputs on real displays |
| **v3** (original) | 2026-10-06 → 10-07 | NAPT Advanced | commits `48a1b45`, `7b57c95`, `4fd9f6e`, `6ba7ca9` | Simplified, touch-aware UI with Media dock; projector-view feed previews |
| **v4** | 2026-10-08 → 10-09 | NAPT Advanced | PR #2, #3, #5 | disguise-style mappings + layers, timeline playback, sections/cues/GO, keyframes, MIDI/MSC/MTC/OSC, fly camera |
| **v5** | 2026-10-09 | **Projection Simulator** | PR #4, #6, #7 | Projector model & lens catalogue, brightness (nits/lux) heatmap, spill, rename + logo |
| **v6** | 2026-10-09 → 10-10 | Projection Simulator | PR #8 | Verified lens table (96 bodies), auto placement, pixel-density heatmap, phone viewer + share link |
| **v7** | 2026-10-10 | Projection Simulator | PR #9 | Colour (sRGB) fix, lens-shift and roll sign fixes, layer blend modes |
| **v8** | 2026-10-12 | Projection Simulator | PR #10 | Phone viewer upgrades (look through projector, full screen, landscape, share), installable offline PWA |
| **v9** | 2026-10-13 → 10-14 | Projection Simulator | PR #11 | Stage presets, multiview panes, workspace modes |

v1 was built in Cursor; v2 onward were built with Claude. Every version kept older project files
loading (v4 migrates v1–v3 projects and media automatically).

---

## 3. Feature record by area

Legend: the **Ver.** column is the version that first added the feature. "(changed vN)" marks a
later change.

### 3.1 Scene and editing

| Feature | Ver. | Notes |
|---|---|---|
| Metric 3D editor, 1 unit = 1 m, right-handed +Y up; UI shows m / cm / mm | v1 | |
| Orbit camera with view presets: Perspective, Top, Front, Side | v1 | |
| Click to select; Move / Rotate gizmo (`W` / `E`), local-axis rotation | v1 | |
| Editable numeric Inspector (position, Rotation X/Y/Z, size) | v1 | Object size controls with display units added 09-10 |
| Object types: flat screen, curved (cylindrical) screen, floor, box, imported model | v1 | |
| Import GLB / GLTF / OBJ models with a scale confirmation | v1 | |
| LED wall objects: physical size, pixel resolution, own image/video, front/back/both sides | v1 | Direct display, independent of projectors |
| Per-object flags: receives projection, blocks projection, projection sides (front / back / both) | v1 | Blocking made always available 09-10 |
| Delete objects from list and Inspector | v1 | |
| Undo / redo of all scene edits (`Ctrl+Z` / `Ctrl+Shift+Z`) | v1 | |
| Two-point measure tool | v1 | Shortcut moved to More → Tools in v4 (M now adds a cue) |
| Look-at aiming for projectors (orbit around a target) | v1 | Roll sign fixed in v7 |
| Default scene: 6 × 3.375 m screen, floor, one projector 6 m back (TR 1.5 → 4.0 × 2.25 m image) | v1 | |
| Fly navigation: hold right mouse + WASD, Q/E down/up, Shift ×3, wheel = speed; pan on middle drag / Shift+left drag | v4 | PR #5 |
| `F` frames the selected object or projector | v4 | |
| Fit (frame everything except the floor) | v8 | Also fixed to run after scene sync in v9 |
| **Stage presets** (toolbar → Stage), replace the scene, undoable: Proscenium theatre, Curved cyc, Scrim + cyc, Black box + floor, LED concert stage, Corporate wide screen, Immersive room, Building facade | v9 | Each comes with aimed projectors, mappings, UV-grid layers, auto blend when 2+ projectors |
| **Set pieces** added into the current scene: flat screen, floor projection area, scrim, stage deck, proscenium arch, column | v9 | New screens join every projector's locked mapping |

### 3.2 Projectors and optics

| Feature | Ver. | Notes |
|---|---|---|
| Throw ratio, resolution, aspect ratio, lens shift H/V | v1 | Lens shift H direction fixed in v7 (+H now moves right) |
| Off-axis perspective projection matrix shared by rendering and calculations | v1 | |
| Optics validation with inline errors (invalid throw ratio rejected) | v1 | |
| Up to **4** projectors, each with own optics, media, colour, transform; enable / solo | v1 | |
| Projector brightness multiplier and blend gamma per projector | v1 | |
| Beam helper: rays from lens to footprint corners and yellow footprint outline (flat and curved) | v1 | |
| **Projector model & lens catalogue** (Inspector → Model & lens): picking a model sets lumens, resolution, aspect, zoom range; zoom slider; distance to fill target; warnings when throw or lens shift is outside the lens | v5 | First 15 approximate bodies (Barco, Epson, Panasonic, Christie, Sony, generic) |
| **Verified projector + lens table**: 96 bodies, 928 projector+lens pairs (Panasonic, Epson, Optoma) checked against maker spec sheets; throw ratio per (body, lens) pair; ANSI vs ISO 21118 lumens labelled; source link per lens | v6 | Source data in `/mnt/project-files/projectors/` (952 researched rows, verified yes/conflict/no) |
| **Auto placement**: Place to fill (square-on); Place to fill keeping current height (uses vertical lens shift, moves only if the lens can't reach); Pick lens for this distance | v6 | Curved screens use their chord |

### 3.3 Projection rendering and preview modes

| Feature | Ver. | Notes |
|---|---|---|
| Projective texture shader with depth-pass occlusion (shadows) | v1 | Multi-projector GLSL3 shader fix 09-11 |
| Physical spill: a projector's raster continues past the screen onto anything behind; blocking screens cast shadows; occluded areas keep base material | v1 | |
| Test patterns: checkerboard, UV grid, colour bars, white, projector ID | v1 | Black and Gray 50 % added v2 |
| Preview: Projection / Original material / Projector UV | v1 | |
| Composite modes: Solo, Raw (true additive), Blend (Σ cᵢ·wᵢ), Coverage count heatmap | v1 | |
| Relative distance falloff heatmap (inverse square) | v1 | |
| Double-sided rendering so screens stay visible when rotated 180° | v1 | |
| Blend Σ heatmap (green seamless, blue dark seam, red hot seam) | v2 | |
| Surface UV preview (UV grid on every surface) | v2 | |
| **Brightness heatmap (nits / lux / fL)**: lumens, throw, off-axis angle, incidence angle, distance and screen gain; legend with scale, 10 % lines | v5 | Black where no light lands, magenta above max (v5, PR #7) |
| **Spill on every surface** in the brightness heatmap (walls, floor, set pieces, shadows) | v5 | PR #6 |
| **Pixel density heatmap (px / m, mm / px)** from the best projector at each point | v6 | Rule of thumb shown: invisible below ≈ 0.3 mm × viewing distance in m |
| Colour pipeline fix: viewport, feeds and LED walls now sRGB-encoded (before, #808080 showed as 55) | v7 | Output windows and feed exports were also too dark before v7 |

### 3.4 Calculations and analysis

| Feature | Ver. | Notes |
|---|---|---|
| Planar footprint by ray–plane intersection; image size and pixel density in Inspector | v1 | |
| Footprint clipping to screen bounds (planar) | v1 | |
| Curved-screen footprint and arc outline | v1 | Area approximate |
| Overlap stats: pairwise area, union, multi-coverage, horizontal overlap, overlap pixels (flat and curved) | v1 | |
| Explicit **calculation target** (which screen the numbers refer to) and explicit shared content source | v1 | Saved, undoable, migrated |
| Sampled coverage: receiver area, geometric vs visible covered, uncovered, visible overlap, occlusion loss, per-projector blocked area; Draft / High sampling | v1 | |
| Analyse side: front / back / both | v1 | |
| Blend uniformity on target (% area within ±2 %, worst seam, max overlap) | v2 | Ignores occlusion |
| Brightness on target: min / average / max / uniformity | v5 | |
| Light on target vs spill per projector (lumens) | v5 | |
| Pixel density on target: softest / average / sharpest | v6 | |
| Reports: CSV and printable HTML with target, sampled metrics, definitions, projector optics/positions | v1 | Projector models, lumens, brightness rows added v5 |

### 3.5 Edge blending, warp and UV mapping

| Feature | Ver. | Notes |
|---|---|---|
| Manual per-edge feathers (L/R/T/B) per projector | v1 | |
| Physically additive soft-edge blending; blend gamma; auto blend widths from measured overlap | v1 | |
| **Auto (geometry) blend**: per-point edge scores that sum to exactly 1, works for curved screens, keystone, 3–4-way corners, ignores occluded projectors | v2 | |
| Blend curve (linear, smoothstep, cosine, power), ramp width, sharpness | v2 | |
| Gamma-correct mask; black-level simulation and black-level compensation | v2 | |
| Live crossover chart | v2 | |
| Export blend mask PNG and projector feed PNG per projector (up to 4096 px) | v2 | |
| **Corner-pin warp** (4-corner homography) per projector, drag or type, Fit to calculation target | v2 | |
| **Per-surface UV mapping**: mesh UV, planar, cylindrical, spherical; region rectangle; rotate, flip, repeat, wrap; 2D UV editor; auto-layout side by side | v2 | In v4 this became the "Feed" mapping |
| Overlapping-UV / out-of-range UV warning; **Generate non-overlapping UVs** (atlas) for imported models | v4 | |

### 3.6 Content and mapping (disguise-style)

| Feature | Ver. | Notes |
|---|---|---|
| Media on projectors: images and videos, fit contain / cover / stretch | v1 | Replaced by layers in v4 (old projects migrate) |
| Mapping modes Raw / Shared (shared content source) | v1 | Mapped to Perspective-locked / Direct in v4 |
| **Content canvas**: author once on a pixel canvas mapped 1:1 to the surface; layers (pattern, solid, image, video) | v1 | |
| **Layers + reusable Mappings** (Studio → Mappings): Direct, Perspective (free or locked to a projector, optional "projector only"), Parallel, Feed, Cylindrical, Spherical | v4 | Content lives only on layers; mappings paint screens; projectors film the painted stage |
| Each screen bakes one composited texture per frame; each projector renders its own content feed | v4 | |
| Mapping filtering: Nearest, Bilinear, MSAA 2× | v4 | |
| Mapping mask image (white shows, black hides) | v4 | |
| Layer blend: Normal, Add, Multiply | v4 | |
| **More blend modes**: Screen, Overlay, Soft light, Lighten, Darken, Difference | v7 | Photoshop formulas on sRGB values |
| Automatic migration of v1–v3 projects and their stored media | v4 | PR #3; tested on all bundled samples |

### 3.7 Playback and show control

| Feature | Ver. | Notes |
|---|---|---|
| Video transport per projector video (play/pause, seek, mute, loop); Play all / Pause all; several videos at once | v1 | |
| Media dock: add video/image to a projector, large play/pause, thick seek bar | v3 | |
| **Master clock** and pure `evaluate(track, t)`; frame-accurate video sync (drift measured with `requestVideoFrameCallback`, ≤5 % rate nudge, seek only when needed, A/B player hand-off at loops) | v4 | Tested: 8 × 1080p with audio at 60 fps in Chrome, all within ~1 frame |
| Layer timing: start, duration, in/out, play mode (loop / once / hold last / ping-pong), speed, fades | v4 | |
| Audio on by default, per-layer volume and mute | v4 | |
| Timeline: ruler, scrub, drag/trim clips, fades, loop marks; transport with `HH:MM:SS:FF` timecode | v4 | Full on desktop, compact on tablet, hidden on phone |
| **Sections** with end action: continue, stop (rewind), hold (freeze), loop | v4 | |
| **Cues** with **GO**; play modes Play / Play section / Loop section | v4 | |
| **Setlist**: multiple tracks, add / duplicate / rename / reorder / switch | v4 | |
| **Keyframes** for opacity, x, y, scale, rotation; linear or ease in/out; diamonds on the timeline | v4 | |
| Keyboard: Space play/pause, Enter GO, Esc stop, ←/→ frame step, Shift+←/→ cues, L loop section, M add cue | v4 | |
| **MIDI learn** (GO, play, pause, stop, next/prev cue, cue N) | v4 | |
| **MIDI Show Control** (GO with cue number, STOP, RESUME, RESET) | v4 | |
| **MIDI timecode chase** (24 / 25 / 29.97 / 30, offset) | v4 | |
| **OSC** via a small local bridge (UDP 9000 → WebSocket 9100): `/show/go`, `/play`, `/pause`, `/toggle`, `/stop`, `/next`, `/prev`, `/cue N`, `/locate S` | v4 | Auto in `npm run dev`; opt-in "Receive OSC" on the hosted site |
| Screen stays awake while playing (Wake Lock) on phones | v8 | |

### 3.8 Outputs to real projectors

| Feature | Ver. | Notes |
|---|---|---|
| Per-projector raster preview (Output panel) with blend ramps | v1 | |
| **Full-screen outputs on other displays** (Window Management API): Detect displays, choose display per projector, send Projector feed / Blend mask only / Alignment grid; `F` full screen, `I` identify | v2 | Display picking by name needs Chrome or Edge |
| Raw-mapping feed is the full raster frame (not cropped to the screen) | v3 | |
| Projector-view feed preview: dims light that misses every surface and outlines surfaces | v3 | Real outputs unchanged |

### 3.9 Layout, panels and workspaces

| Feature | Ver. | Notes |
|---|---|---|
| Collapsible Scene / Inspector / Status panels; resizable (160–560 px); pop-out floating panels | v1 | |
| Phone / tablet layouts: drawers, bottom navigation, safe areas, adaptive render quality | v1 | 09-11 |
| **Studio** panel (Edge Blend, UV Mapping, Warp, Outputs) | v2 | Mappings tab added v4 |
| Minimal toolbar with Add / View / More menus (bottom sheets on phones); controls size to the input device (44 px on touch) | v3 | |
| Layers panel, Cues panel, External control panel | v4 | |
| **Multiview**: layouts 1, 1|1, 1+3, 2×2; extra panes = Perspective, Top/Front/Side (orthographic), Through projector, Output · projector | v9 | One WebGL context; layout remembered per browser |
| **Workspace modes**: Stage, Mapping, Previz, Show, Output | v9 | Only arrange the screen |

### 3.10 Phone viewer and sharing

| Feature | Ver. | Notes |
|---|---|---|
| Simple phone viewer: 3D view, chips Picture / Brightness / Sharpness / Blends, cameras, "Numbers" sheet, play / stop / GO; Edit opens the full editor | v6 | |
| **Copy link for phone**: whole project compressed into a `#view=` link, nothing uploaded | v6 | Imported media and models not included |
| Look through a projector (camera sits at the lens, fits the whole image) | v8 | |
| Full screen viewer; landscape layout (3D left, controls right) | v8 | |
| Share via phone share sheet; open a project file on the phone | v8 | |

### 3.11 Saving, app and branding

| Feature | Ver. | Notes |
|---|---|---|
| New / Open / Save `.projectionlab.json`; media in IndexedDB; autosave every 2 s | v1 | Autosave bug fixed in v4 (PR #3) |
| Bundled samples: two-projector blend, curved screen, spill occlusion | v1 | Advanced curved auto-blend and multi-surface UV samples added v2 |
| Separate storage keys per major version so versions can run side by side | v2 | |
| Renamed **Projection Simulator**, new logo and favicon | v5 | Was "Not a Projection Tool (NAPT)" / "NAPT Advanced" |
| **Installable PWA**: Add to Home Screen, works offline after one visit, auto-updates | v8 | |
| Tests: ~41 Vitest unit test files, 16 Playwright end-to-end specs | — | Cumulative through v9 |

---

## 4. Known gaps and limits (as of v9)

**Hard limits**
- Maximum **4 projectors** per project.
- No dome / sphere object, no lighting fixtures or DMX, no live input (webcam, capture card,
  NDI), no multi-machine sync.
- Optics are ideal pinhole lenses: no lens distortion, vignetting or per-projector colour.

**Accuracy caveats**
- Barco, Christie, Sony and generic projector bodies still use approximate figures; only
  Panasonic, Epson and Optoma come from the verified table. Epson brightness is ISO 21118, not ANSI.
- Brightness model is geometric (lumens, angles, distance, gain); not a calibrated photometric solve.
- Auto blend is a distance-weighted edge blend, not an optimised photometric blend. Blend
  uniformity sampling ignores occlusion. Black-level model is uniform and additive.
- Imported meshes are not occluders in the sampled coverage calculation. Curved footprint area is
  approximate.

**Playback and control**
- MIDI learn / MSC / MTC tested only with a simulated MIDI device, not real hardware.
- Loop points can still drop a couple of frames.
- Safari has no Web MIDI; Safari and Firefox were not tested for outputs. Use Chrome.
- OSC needs the local bridge running (browsers can't receive UDP).

**Other**
- The phone share link does not carry imported images, videos or models.
- Projects saved before v7 with a non-zero lens shift H show the image on the other side (no
  automatic migration; flip the sign).
- Multiview layout is saved in the browser, not in the project file.
- From the original ideas list (`/mnt/project-files/ideas/v5-feature-ideas.md`), not built yet:
  audio waveform on the timeline, automatic low-res proxies, show-lock mode, project + media zip
  export, LTC timecode input, PDF report (HTML report exists), VR / 360 preview, audience
  sight-line analysis, FBX import.

---

## 5. Where things are

| What | Where |
|---|---|
| Code | github.com/nottechhoman/ProjectionSim; deploy branch `feat/reliability-shared-source-target`; per-version branches `feat/advanced-v2`, `feat/v4-mapping-playback` … `feat/v9-stage-multiview` |
| Per-version notes | `docs/v4.md` … `docs/v9.md`, `ADVANCED.md` (v2), `docs/PROJECTIONLAB_SUMMARY.md` (v1) |
| Local copies | User's Mac: `/Users/sohoman/Desktop/Vibe code_Projection Sim` (older versions kept untouched) |
| Projector / lens research | `/mnt/project-files/projectors/` (CSV, README, verification log) |
| Screenshots | `/mnt/project-files/screenshots/` (v5–v9) |
| Design docs | Mapping: https://claude.ai/code/artifact/0135073d-daba-4d8f-9175-fc9d37d7f5ed · Playback: https://claude.ai/code/artifact/02bbb89c-3a71-43d8-98df-04db03040fec |
