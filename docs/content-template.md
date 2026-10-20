# Content template export

Studio → Mappings → pick a mapping → **Content template**.

The template is a PNG at the mapping's canvas resolution (1 template pixel = 1 canvas pixel), so a content
maker can put it under their composition and line media up exactly. It shows:

- every screen on the mapping in its own colour, with a bright outline;
- a label per screen: name, bounding box in canvas pixels (`W × H px at x, y`, top-left origin), physical size,
  and the share of the screen that is a blend zone;
- **blend zones**: single hatch where 2 projectors overlap, cross hatch for 3+ (enabled projectors only);
- a 100 px grid (200 px above 4K) with pixel numbers every 5 lines, and a centre cross;
- a title box: mapping name, kind, resolution.

Grid, labels and blend zones can each be switched off. **Regions CSV** downloads one row per screen
(`x_px, y_px, width_px, height_px, pixels, blend_zone_pixels, physical_size`).

## How it works

`src/mapping/contentTemplate.ts` pushes every screen triangle through `mappingCanvasUvUnclipped()` — the same
texel → canvas function the bake shader mirrors (`sample.ts`) — and rasterises it into a per-pixel owner buffer.
Direct and plain Feed mappings are linear in surface UV, so triangles are drawn as they are; Perspective,
Parallel, Cylindrical, Spherical and projected Feed regions are subdivided to ~12 px so curves stay smooth.
Triangles crossing a cylindrical / spherical seam are skipped. Perspective canvases depth-test (the nearer
screen wins), as a viewer at the eye would see it. Blend zones count, per pixel, the enabled projectors whose
raster contains the point. `contentTemplateDraw.ts` turns the buffers into the PNG.

## Limits

- Blend zones ignore occlusion, projection sides and warp (same as blend uniformity).
- Feed regions with repeat > 1 are subdivided like non-linear mappings; tile edges can be off by a pixel or two.
- Canvases larger than 16384 px on a side are scaled down.
