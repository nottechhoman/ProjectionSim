# ProjectionLab — Browser-Based Projection Planning Simulator

## 1. Your task

Act as a senior graphics engineer and full-stack developer.

Build a working browser-based 3D projection simulator, not merely a UI mockup.

Users must be able to:
- Create a scene with realistic metric dimensions.
- Add and position multiple projectors.
- Configure lens throw ratio, resolution, aspect ratio, and lens shift.
- Project images, video, and test patterns onto scene geometry.
- Rotate a projector and see the resulting geometric distortion.
- Calculate actual projected coverage and dimensions.
- Inspect multi-projector overlap and preview edge blending.
- Import 3D models for venue visualization and projection surfaces.
- Save and reload projects and export calculation reports.

Inspect the existing repository before making changes.
Preserve working functionality and follow its conventions.

If the repository is empty, scaffold the application.

Do not stop after writing a plan. Implement, run, test, and fix the application.
If a feature must be deferred, clearly identify it instead of creating a
nonfunctional control or claiming it works.

## 2. Technical direction

Preferred stack:
- TypeScript.
- React for application UI.
- Vite for development and build.
- Three.js with WebGLRenderer for 3D rendering.
- Custom GLSL projection shaders.
- Zustand or similarly lightweight state management.
- Vitest for calculation tests.
- Playwright for browser smoke tests.

Use mutually compatible stable package versions.
Check official documentation for the versions installed.
Commit a package lockfile.

Keep rendering and mathematical calculations separate from React components.

Use native Three.js for the rendering engine unless the existing project already
uses React Three Fiber. Avoid mixing competing scene-management approaches.

Start with WebGL2. Do not introduce a second WebGPU rendering implementation
during the initial build.

Run locally without an account, paid API, or backend.
Do not upload user media or models.

## 3. Accuracy and scope

Implement an ideal rectilinear pinhole-projector model initially.

Clearly label the application as a planning and visualization tool.

Do not claim to simulate:
- Manufacturer-specific lens distortion without calibration data.
- Accurate ultra-short-throw or mirror optics.
- Focus, depth of field, chromatic aberration, or optical MTF.
- Measured brightness uniformity or certified photometry.
- Automatic real-world projector calibration.
- Hardware output synchronization.

Rotating a projector must show perspective/keystone distortion naturally.
Do not confuse that distortion with optical barrel or pincushion distortion.

Use generic editable projector presets.
Do not invent specifications for named commercial projectors.

## 4. Coordinate system and metric units

Use:
- 1 scene unit = 1 meter.
- Right-handed coordinates.
- +Y = up.
- Projector local forward direction = -Z.
- Projector transform origin = lens optical center.

Store orientation as a quaternion.
Expose yaw, pitch, and roll in degrees using one documented Euler order.

Define positive rotation directions in the UI and tests.

Store lengths internally in meters.
Allow display/input in m, cm, and mm.
Show areas in m², angles in degrees, and density in px/m or mm/px.

Do not round internal calculations.

Separate the projector body model from the optical origin.
Allow an editable lens-to-body offset.

## 5. Scene editor

Provide:
- Orbit, pan, zoom, and frame-selection controls.
- Perspective, top, front, and side views.
- Metric grid and axes.
- Scene hierarchy.
- Object selection.
- Translation, rotation, and scale gizmos.
- Numerical transform inputs.
- Duplicate, delete, hide, and lock.
- Undo/redo for scene editing.
- Two-point metric measurement.

Built-in objects:
- Flat rectangular screen.
- Wall.
- Floor.
- Box.
- Cylinder.
- Curved screen with configurable radius, height, and arc angle.

Objects must have separate flags for:
- Visible in editor.
- Receives projection.
- Blocks projection.

An object may block projection without receiving it.
Define transparent materials as opaque blockers initially and document this.

Provide projection-preview material mode and original-material mode.
Do not silently destroy imported materials.

## 6. Projector controls

Support at least four simultaneous projectors on supported hardware.

Each projector needs:
- ID, name, enabled state, and display color.
- Position and orientation.
- Native horizontal/vertical resolution.
- Raster aspect ratio.
- Selected throw ratio.
- Optional minimum/maximum throw ratio.
- Horizontal and vertical lens shift.
- Near/far simulation limits.
- Image/video/test-pattern source.
- Source crop and fit mode.
- Brightness multiplier.
- Per-edge blend controls.

Optional estimated-photometry fields:
- ANSI lumens.
- Optical efficiency.
- Black-level parameter.

Show:
- Projector body.
- Lens origin.
- Optical axis.
- Frustum edges.
- Surface footprint outline.
- Selected-projector raster preview.

Use one optical model for shaders, raycasting, frustum helpers, and calculations.
Never maintain unrelated camera and calculator values.

## 7. Projection mathematics

Define:
- T = throw ratio.
- A = raster width / raster height.
- D = axial distance to a reference plane perpendicular to the optical axis.
- W = nominal projected width on that plane.
- H = nominal projected height.

Implement:

W = D / T
H = W / A
diagonal = sqrt(W² + H²)

horizontalFOV = 2 * atan(1 / (2 * T))
verticalFOV = 2 * atan(1 / (2 * T * A))

Convert radians to degrees when required by the camera API.

Reject zero, negative, nonfinite, and otherwise invalid parameters.

For a selected image width:
Dmin = W * Tmin
Dmax = W * Tmax

For a selected throw distance:
Wmin = D / Tmax
Wmax = D / Tmin

### Lens shift

Implement lens shift with an off-axis projection matrix.

Use an explicit internal convention:
- Horizontal shift = image-center displacement / full image width.
- Vertical shift = image-center displacement / full image height.
- Positive values move the image toward projector-local right/up.

For example, +0.5 vertical shift means half a full image height.

Do not rotate the projector to imitate lens shift.

Document that manufacturer percentage conventions may differ.
Only apply manufacturer limits when explicitly supplied.

### Actual surface intersections

The nominal formulas above are only the perpendicular-plane reference case.

For tilted or irregular surfaces:
- Unproject projector raster coordinates into rays.
- Find the nearest valid surface hit.
- Compute geometry from those intersections.
- Handle missed rays and nearly parallel intersections safely.

For a finite planar screen:
- Compute the footprint in screen-local 2D coordinates.
- Clip it to the actual screen boundary.
- Report the unclipped footprint separately where useful.
- Handle cases where the projected footprint contains the screen but all
  projector corner rays miss the finite screen mesh.

Do not describe arbitrary curved-surface coverage as one exact rectangle.

## 8. Actual image and video projection

Implement projective texturing.

For each receiving fragment:
1. Obtain world-space position.
2. Transform it into projector clip space.
3. Reject points behind the projector.
4. Perform perspective division.
5. Reject points outside the frustum.
6. Convert projected coordinates into raster UV.
7. Apply source crop/fit and any enabled digital warp.
8. Apply projector visibility and blend weight.
9. Sample and accumulate the projected source.

Do not simply assign the video to the surface's existing UV coordinates in
raw-projector mode.

Moving the editor camera must not move the projection.
Moving or rotating the projector must change the projection.

### Occlusion

Render a depth map from each enabled projector.

Compare receiving-fragment depth with projector depth using consistent
coordinates and a configurable bias.

Projection must not pass through a wall or blocker onto geometry behind it.

Exclude editor helpers and frustum graphics from depth maps.
Handle front/back face rules explicitly.

Update depth maps when projectors or blocking geometry change.
Video playback alone should not regenerate unchanged depth maps.

### Sources

Support:
- Local image files.
- Browser-decodable local video files.
- Checkerboard.
- UV grid.
- Color bars.
- White field.
- Projector ID and alignment markers.

Provide:
- Play/pause.
- Seek.
- Loop.
- Mute.
- Playback-rate controls.
- Contain, cover, and stretch.
- Source cropping.

Show useful codec/decode errors.
Use object URLs and clean them up when no longer needed.

For projectors sharing the same video, reuse one video element and shared
texture where possible.

Handle color-space conversion explicitly and exactly once.
Accumulate light contributions in linear space.

## 9. Separate raw projection from corrected mapping

Provide two clearly labelled modes.

### A. Raw projector mode

Each projector displays its raster through its lens geometry.

Rotating the projector must visibly distort the content on the surface.
Automatic correction is OFF by default.

Different projector rasters do not automatically align just because they
use the same video.

### B. Shared-canvas mapping mode

Define a common content coordinate system:
- Screen-local coordinates for a planar screen.
- A documented cylindrical mapping for curved screens.
- Valid model UV coordinates for imported meshes.

Generate each projector's corrected raster from that shared content mapping,
then project that raster through the normal projection pipeline.

A projector-view render of the content-mapped receiving geometry is an
acceptable implementation.

Show the generated per-projector raster.

Do not fake corrected projection by painting a global texture directly onto
the surface while bypassing projector visibility and raster generation.

For imported meshes without suitable UVs:
- Raw projection must still work.
- Disable shared-canvas mode with a useful explanation.
- Offer planar mapping where appropriate.

Planar four-corner homography correction may be added as an explicit digital
warp. Keep it separate from lens shift and physical rotation.

## 10. Multi-projector overlap and blending

Provide three preview modes:
1. Unblended additive projection.
2. Overlap/coverage heatmap.
3. Edge-blended projection.

Calculate overlap on receiving surfaces, not merely where 3D frusta intersect.

### Planar screens

Use clipped footprint polygons in screen coordinates.

Report:
- Area covered by each projector.
- Pairwise overlap area.
- Overlap percentage relative to each participating footprint.
- Union coverage area.
- Area with two or more projectors.
- Uncovered target area.

Do not sum pairwise overlap areas to calculate total overlap when triple
coverage exists.

For aligned rectangular images, also show:
- Horizontal/vertical overlap in meters.
- Overlap pixels per projector.
- Percentage of each projector's image width/height.

For equal-width horizontal images with constant adjacent overlap:

combinedWidth = N * W - (N - 1) * overlapWidth

Only use this shortcut when its assumptions are satisfied.

### Curved and imported surfaces

Use area-weighted surface sampling or triangle subdivision.
Include visibility/occlusion tests.

Display:
- Sample count.
- Sampling resolution.
- Estimated covered/overlap area.
- An “approximate” label.

Do not treat equal numbers of arbitrary samples as equal physical areas.

### Blending

Implement per-projector left/right/top/bottom feather controls.

Use smooth ramps in projector coordinates.

For visible projectors at surface point p, define:
- rawWeight_i(p) >= 0
- weight_i = rawWeight_i / sum(rawWeight_j)

Only normalize across enabled, visible contributors in the blend group.

Handle zero-weight cases explicitly.
Avoid fading single-projector regions unless outer-edge fading is enabled.

For aligned shared-canvas content, ideal equal-gain blend weights should sum
to approximately 1 inside covered regions.

Allow brightness multipliers and blend-curve adjustment.
Distinguish blend-curve shape from source transfer-function correction.

Display a warning in raw mode:
"Blending reduces brightness seams; it does not align mismatched content."

Offer:
- Ideal equalized preview.
- Approximate additive brightness preview.

Do not claim blending can cancel a projector's black-level light leakage.
Keep residual black level separate from the attenuated video signal.

## 11. Measurements and calculation inspector

For each projector display:
- Lens position and orientation.
- Throw ratio and configured range.
- Horizontal and vertical FOV.
- Nominal perpendicular-plane width, height, diagonal, and area.
- Center-ray distance to the selected surface, if it hits.
- Perpendicular distance to a selected plane.
- Actual surface footprint measurements.
- Corner coordinates where defined.
- Top/bottom/left/right edge lengths where meaningful.
- Visible and clipped coverage.
- Average and local pixel density where available.

Label different distance definitions clearly.
Do not substitute slant distance into the perpendicular-plane width formula.

For perpendicular planar projection:
horizontalPixelsPerMeter = horizontalResolution / W
verticalPixelsPerMeter = verticalResolution / H
horizontalMillimetersPerPixel = 1000 * W / horizontalResolution

For distorted surfaces, estimate local pixel footprint with neighboring
raster-ray intersections and display a heatmap.

Define any reported distortion metric, for example:
horizontalKeystonePercent =
    100 * abs(topWidth - bottomWidth) / max(topWidth, bottomWidth)

Treat such metrics as descriptive, not universal projector specifications.

### Optional brightness estimate

Only implement if assumptions are explicit.

For an ideal uniform distribution over a fully intercepted footprint:
averageLux ≈ effectiveLumens / illuminatedArea

Do not assign the full projector lumen output to a small clipped part of
the image.

If estimating luminance for a matte Lambertian surface:
luminanceCdM2 ≈ illuminanceLux * reflectance / PI

Label these as approximate and not installation-grade measurements.
Do not fabricate a spatial lux map from lumens alone.

## 12. 3D model import

Required:
- GLB.
- GLTF with associated files selected as a bundle.

Optional after the core works:
- OBJ with associated MTL/textures.

Provide:
- Drag-and-drop.
- Import progress and error reporting.
- Dimension/bounding-box preview.
- Source-unit or scale confirmation.
- Scale, rotate, translate, and center controls.
- Receive-projection and block-projection flags.
- Original-material and neutral-matte preview modes.

Do not silently resize models to fit the scene.

For animated/skinned models, either freeze them into a documented static
pose or fully support their deformation in projection and depth passes.

Dispose geometries, materials, textures, video resources, and object URLs
when safely no longer referenced.

## 13. UI layout

Create a clean desktop-oriented technical interface.

Top toolbar:
- New/open/save.
- Import model/media.
- Add projector/surface.
- Units.
- View controls.
- Screenshot/report export.

Left panel:
- Scene hierarchy.
- Projectors.
- Surfaces.
- Models.
- Media.

Center:
- 3D viewport.
- Grid, labels, measurement overlays, and selection helpers.

Right inspector:
- Transform.
- Lens and raster.
- Media.
- Blending.
- Surface settings.
- Calculation results.

Bottom panel:
- Video timeline.
- Projector raster preview.
- Warnings and performance information.

Show readable numbers and concise tooltips.
Avoid decorative dashboard widgets that do not help projection planning.

## 14. Persistence and export

Implement:
- Versioned project JSON.
- Import/export.
- Local autosave with debounce.
- PNG viewport screenshot.
- CSV calculation report.
- Printable HTML project report.

Persist projector settings, geometry, transforms, media assignments,
blend settings, mapping mode, and units.

Do not serialize temporary blob URLs as permanent asset references.

Use IndexedDB for locally persisted asset blobs if implemented.
Otherwise save asset metadata and provide a clear missing-asset relink flow.

Warn that plain JSON does not necessarily include model/video files.

## 15. Performance and architecture

Suggested modules:
- optics/
- projection/
- visibility/
- coverage/
- blending/
- media/
- scene/
- persistence/
- ui/

Use typed interfaces for:
- Projector configuration.
- Optical state.
- Surface definitions.
- Assets.
- Blend groups.
- Calculation results.

Reuse render targets and shader programs.
Avoid unnecessary shader recompilation.
Cap viewport pixel ratio.
Provide low/medium/high depth-map and coverage-sampling quality.

Throttle expensive coverage calculations during dragging.
Recompute accurately when interaction ends.

Check GPU texture/sampler capabilities.
Gracefully limit projector count or use multipass rendering when required.

Target interactive operation with four projectors and a moderate scene.
Report measured performance rather than promising a universal frame rate.

Show a useful message when WebGL2 is unavailable.

## 16. Acceptance tests

### Test 1: Basic optics

Projector:
- Position: (0, 0, 6) meters.
- Orientation: identity, looking along -Z.
- Throw ratio: 1.5.
- Resolution: 1920 × 1080.
- Lens shift: zero.

Screen:
- Plane at Z = 0.
- Facing +Z.
- Large enough to contain the image.

Expected:
- Width = 4.000 m.
- Height = 2.250 m.
- Area = 9.000 m².
- Diagonal ≈ 4.589 m.
- Density = 480 px/m in both directions.
- Pixel size ≈ 2.083 mm/px.

### Test 2: Lens shift

Apply +0.5 vertical lens shift.

Expected:
- Image center moves +1.125 m in world Y.
- Width and height remain unchanged.
- Projector orientation does not change.

### Test 3: Rotation

Apply a documented 20-degree yaw.

Expected:
- Raw checkerboard projection becomes geometrically distorted.
- Footprint coordinates and measured edge lengths change.
- No automatic correction occurs.
- Measurements match independently calculated ray-plane intersections.

### Test 4: Overlap

Two projectors each produce a 4.0 m × 2.25 m rectangle.
Offset image centers horizontally by 3.2 m.

Expected:
- Horizontal overlap = 0.8 m.
- Overlap = 20% of each image width.
- Overlap area = 1.8 m².
- Combined width = 7.2 m.
- Union area = 16.2 m².
- Overlap = 384 pixels for each 1920-pixel-wide image.

Also test triple overlap without double-counting union area.

### Test 5: Blending

Use aligned shared-canvas white content and equal projector gains.

Expected:
- Unblended overlap has increased linear brightness.
- Ideal blend weights sum to approximately 1.
- Blended linear-light output has no double-bright overlap.
- Validate linear buffers, not only tone-mapped screenshots.

### Test 6: Occlusion

Place a box between the projector and screen.

Expected:
- The box blocks projection onto the screen behind it.
- Moving the editor camera does not change that blocked region.

### Test 7: Video and imported models

Expected:
- Local video plays, pauses, seeks, and projects correctly.
- A GLB imports at a confirmed metric scale.
- Raw projection works without relying on model UV coordinates.
- Unsupported video files fail gracefully.

### Test 8: Save/reload and edge cases

Test:
- Save/reload preserves dimensions and projector optics.
- Missing media can be relinked.
- Invalid throw ratios are rejected.
- Rays parallel to a plane do not produce NaN results.
- Behind-projector geometry receives no projection.
- Disabled projectors contribute no coverage or brightness.
- A small screen inside a larger footprint is measured correctly.
- Moving the viewer camera leaves projection unchanged.

## 17. Implementation milestones

### Milestone 1 — Working single-projector simulator
- Repository setup.
- Metric scene.
- One screen and projector.
- Correct throw-ratio optics.
- Test-pattern projective shader.
- Position/rotation controls.
- Actual footprint measurements.
- Occlusion.
- Core calculation tests.

### Milestone 2 — Media and 3D scenes
- Image/video sources.
- GLB/GLTF import.
- Curved surfaces.
- Surface flags and material modes.
- Save/load.

### Milestone 3 — Multiple projectors
- Four-projector support.
- Overlap calculations and heatmaps.
- Raw versus shared-canvas modes.
- Corrected projector raster generation.
- Edge-blending preview.
- Raster and blend-mask inspection.

### Milestone 4 — Polish and verification
- Undo/redo.
- Reports.
- Performance controls.
- Browser smoke tests.
- Documentation and limitation notices.

After each milestone:
1. Run the application.
2. Run relevant tests.
3. Check browser console and shader compilation.
4. Verify the main interaction visually if browser tools are available.
5. Fix failures before proceeding.

## 18. Deliverables

Provide:
- Working source code.
- Package scripts for dev, build, typecheck, and tests.
- README with installation and usage.
- Mathematical assumptions and coordinate conventions.
- A sample single-projector scene.
- A two-projector blend scene.
- A curved-surface or imported-model example.
- Calculation tests and browser smoke tests.
- Known limitations and deferred features.
- Summary of commands actually run and their results.

Do not claim a test passed unless it was executed.
Do not mark a milestone complete if its main feature is only a placeholder.

Start by inspecting the repository, then implement Milestone 1.
Continue through the milestones while keeping the application runnable.
