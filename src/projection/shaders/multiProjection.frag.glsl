// Unified projector compositing shader (v2, v4 content feeds).
// Handles 1–4 projectors, corner-pin warp, per-projector content feeds, manual and
// geometry-aware auto edge blending, display-gamma handling, black-level
// simulation/compensation, analysis previews and per-projector feed rendering.
// CPU mirrors: src/blending/advancedBlend.ts, src/warp/homography.ts — keep them in sync.
// Content is baked per screen first (src/mapping/shaders/bake.frag.glsl).

#define MAX_P 4

uniform mat4 projectorMatrices[MAX_P];
uniform sampler2D depthMaps[MAX_P];
// v4: each projector's content feed — the textured screens rendered from that
// projector's (unwarped) camera. Light at raster p carries feed(warpInv(p)).
uniform sampler2D feedMaps[MAX_P];
uniform float depthBias;
uniform int useOcclusion;
uniform float brightness[MAX_P];
uniform vec4 blendEdges[MAX_P];
uniform float outerEdgeFade[MAX_P];
uniform float blendGamma[MAX_P];
uniform vec2 depthMapSize;
uniform int projectorCount;
uniform int compositeMode;
uniform int forceUvPreview;
uniform vec3 surfaceBaseColor;
// v4: this mesh's screen texture (set per mesh) for the content-feed pass.
uniform sampler2D screenMap;
uniform int hasScreenMap;

uniform int projectionSides;
uniform int falloffPreview;
uniform vec3 projectorWorldPos[MAX_P];
uniform float falloffRefDistance[MAX_P];

// ---- v5: absolute brightness preview (CPU mirror: src/optics/illuminance.ts) ----
uniform float projLumens[MAX_P];
uniform vec3 projForward[MAX_P];
uniform float projUnitArea[MAX_P];   // image area (m²) at 1 m
uniform float illumScaleMax;
uniform int illumUnit;               // 0 lux, 1 nits
uniform float screenGain;
// ---- v6: pixel density preview (CPU mirror: pixelDensityAt in src/optics/illuminance.ts) ----
uniform float projPxAt1m[MAX_P];     // throw ratio × horizontal resolution
uniform float densityScaleMax;      // px/m at the top of the scale

// ---- v2: warp -------------------------------------------------------------
uniform mat3 warpInv[MAX_P];

// ---- v2: advanced blending -------------------------------------------------
uniform int blendMode;          // 0 manual feathers, 1 auto (geometry-aware)
uniform int blendCurve;         // 0 linear, 1 smoothstep, 2 cosine, 3 power
uniform float blendWidth;
uniform float blendExponent;
uniform int blendGammaCorrect;
uniform float displayGamma;
uniform float blackLevel;
uniform int blackComp;
uniform float maxOverlap;

// ---- v2: previews / feed ---------------------------------------------------
uniform int previewKind;        // 0 normal, 1 blend sum, 2 surface UV, 3 illuminance, 4 pixel density
uniform int feedIndex;          // -1 scene view; >= 0 render that projector's feed
uniform int feedKind;           // 0 colour feed, 1 blend mask only, 2 content feed (textured screens)
// v3: 0 surfaces only (black where no surface), 1 full-frame raster background,
// 2 surfaces drawn over that background (misses are left to the background).
uniform int feedLayer;
uniform vec2 feedSize;          // feed render target size in pixels
// v3 "projector view" preview: dim light that misses every surface and outline the
// surfaces, so the screen shows up sized / keystoned by throw distance and placement.
uniform int feedView;
uniform float feedSpill;        // brightness of spill (1 = real signal)

in vec3 vWorldPos;
in vec2 vSurfaceUv;
out vec4 fragColor;

const float PI = 3.14159265359;

bool receivesOnThisFace() {
  if (projectionSides >= 2) return true;
  if (projectionSides == 0) return gl_FrontFacing;
  return !gl_FrontFacing;
}

float checker(vec2 uv) {
  vec2 c = floor(uv * 16.0);
  return mod(c.x + c.y, 2.0);
}

float smoothFeather(float edge0, float edge1, float x) {
  if (edge1 <= edge0) return x >= edge1 ? 1.0 : 0.0;
  float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

float rawBlendWeight(vec2 uv, vec4 edges, float outerFade) {
  float w = 1.0;
  if (edges.x > 0.0) w *= smoothFeather(0.0, edges.x, uv.x);
  if (edges.y > 0.0) w *= smoothFeather(0.0, edges.y, 1.0 - uv.x);
  if (edges.z > 0.0) w *= smoothFeather(0.0, edges.z, 1.0 - uv.y);
  if (edges.w > 0.0) w *= smoothFeather(0.0, edges.w, uv.y);
  if (outerFade > 0.5) {
    float o = 0.04;
    w *= smoothFeather(0.0, o, uv.x) * smoothFeather(0.0, o, 1.0 - uv.x);
    w *= smoothFeather(0.0, o, uv.y) * smoothFeather(0.0, o, 1.0 - uv.y);
  }
  return w;
}

float curveShape(float t) {
  float x = clamp(t, 0.0, 1.0);
  if (blendCurve == 0) return x;
  if (blendCurve == 1) return x * x * (3.0 - 2.0 * x);
  if (blendCurve == 2) return 0.5 - 0.5 * cos(PI * x);
  return x * x;
}

float edgeScore(vec2 q) {
  float w = max(0.05, blendWidth);
  float dx = min(q.x, 1.0 - q.x) * 2.0;
  float dy = min(q.y, 1.0 - q.y) * 2.0;
  return curveShape(dx / w) * curveShape(dy / w);
}

// WebGL2 requires constant sampler indices — branch on projector slot.
vec3 sampleFeedAt(int idx, vec2 q) {
  if (idx == 0) return texture(feedMaps[0], q).rgb;
  if (idx == 1) return texture(feedMaps[1], q).rgb;
  if (idx == 2) return texture(feedMaps[2], q).rgb;
  return texture(feedMaps[3], q).rgb;
}

float sampleDepthAt(int idx, vec2 uv) {
  if (idx == 0) return texture(depthMaps[0], uv).r;
  if (idx == 1) return texture(depthMaps[1], uv).r;
  if (idx == 2) return texture(depthMaps[2], uv).r;
  return texture(depthMaps[3], uv).r;
}

bool projectorVisibleAt(int idx, vec2 uv, float fragDepth) {
  if (useOcclusion == 0) return true;
  float sceneDepth = sampleDepthAt(idx, uv);
  return fragDepth <= sceneDepth + depthBias;
}

float distanceFalloffIntensity(float dist, float refDist) {
  float ratio = refDist / max(dist, 0.05);
  return clamp(ratio * ratio, 0.0, 1.0);
}

vec3 falloffHeatmap(float intensity) {
  float t = clamp(intensity, 0.0, 1.0);
  vec3 cold = vec3(0.05, 0.08, 0.35);
  vec3 mid = vec3(0.95, 0.45, 0.05);
  vec3 hot = vec3(1.0, 0.98, 0.75);
  if (t < 0.5) return mix(cold, mid, t * 2.0);
  return mix(mid, hot, (t - 0.5) * 2.0);
}

vec3 heatmapColor(int count) {
  if (count <= 0) return vec3(0.05);
  if (count == 1) return vec3(0.2, 0.75, 0.35);
  if (count == 2) return vec3(0.95, 0.85, 0.2);
  return vec3(0.95, 0.3, 0.25);
}

// Blend-sum analysis colour: green = 1.0 (seamless), blue = dark seam, red = hot seam.
vec3 blendSumColor(float s) {
  float d = s - 1.0;
  if (abs(d) < 0.02) return vec3(0.15, 0.78, 0.35);
  if (d < 0.0) return mix(vec3(0.15, 0.78, 0.35), vec3(0.1, 0.25, 0.95), clamp(-d * 2.5, 0.0, 1.0));
  return mix(vec3(0.15, 0.78, 0.35), vec3(0.98, 0.2, 0.15), clamp(d * 2.5, 0.0, 1.0));
}

vec3 uvGridColor(vec2 uv) {
  vec2 g = abs(fract(uv * 10.0 - 0.5) - 0.5) / fwidth(uv * 10.0);
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  vec3 base = vec3(fract(uv), 0.25);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) base *= 0.35;
  return mix(base, vec3(1.0), line * 0.8);
}

void accumulateFalloffAt(int idx, inout float bestIntensity) {
  if (idx >= projectorCount) return;
  vec4 projClip = projectorMatrices[idx] * vec4(vWorldPos, 1.0);
  if (projClip.w <= 0.0) return;
  vec3 projNDC = projClip.xyz / projClip.w;
  if (abs(projNDC.x) > 1.0 || abs(projNDC.y) > 1.0 || abs(projNDC.z) > 1.0) return;
  vec2 uv = projNDC.xy * 0.5 + 0.5;
  float fragDepth = projNDC.z * 0.5 + 0.5;
  if (!projectorVisibleAt(idx, uv, fragDepth)) return;
  float dist = length(vWorldPos - projectorWorldPos[idx]);
  float intensity = distanceFalloffIntensity(dist, falloffRefDistance[idx]) * brightness[idx];
  bestIntensity = max(bestIntensity, intensity);
}

float illuminanceFrom(int idx, vec3 n) {
  vec3 ray = vWorldPos - projectorWorldPos[idx];
  float r2 = dot(ray, ray);
  if (r2 < 1e-8) return 0.0;
  vec3 d = ray * inversesqrt(r2);
  float cosA = dot(d, projForward[idx]);
  if (cosA <= 1e-4) return 0.0;
  float cosT = abs(dot(d, n));
  return projLumens[idx] / projUnitArea[idx] / (cosA * cosA * cosA) * cosT / r2;
}

float pixelDensityFrom(int idx, vec3 n) {
  vec3 ray = vWorldPos - projectorWorldPos[idx];
  float r = length(ray);
  if (r < 1e-4) return 0.0;
  vec3 d = ray / r;
  float cosA = dot(d, projForward[idx]);
  if (cosA <= 1e-4) return 0.0;
  float cosT = abs(dot(d, n));
  return projPxAt1m[idx] * sqrt(cosT / (cosA * cosA * cosA)) / r;
}

// Keep in sync with ILLUMINANCE_RAMP in src/optics/illuminanceRamp.ts.
vec3 illuminanceRamp(float t) {
  vec3 c0 = vec3(0.07, 0.04, 0.20);
  vec3 c1 = vec3(0.16, 0.25, 0.80);
  vec3 c2 = vec3(0.10, 0.70, 0.75);
  vec3 c3 = vec3(0.35, 0.82, 0.25);
  vec3 c4 = vec3(0.98, 0.82, 0.15);
  vec3 c5 = vec3(0.92, 0.22, 0.12);
  // Over the scale max: saturated magenta (never white, so it can't be mistaken for unlit).
  if (t > 1.0) return mix(c5, vec3(0.95, 0.15, 0.85), clamp((t - 1.0) * 4.0, 0.0, 1.0));
  float x = clamp(t, 0.0, 1.0) * 5.0;
  if (x < 1.0) return mix(c0, c1, x);
  if (x < 2.0) return mix(c1, c2, x - 1.0);
  if (x < 3.0) return mix(c2, c3, x - 2.0);
  if (x < 4.0) return mix(c3, c4, x - 3.0);
  return mix(c4, c5, x - 4.0);
}

// Colour for a scene fragment no projector lights. In the brightness preview that is
// "no light" (near black), not the surface's own colour, which may be white.
vec3 unlitColor() {
  return previewKind == 3 || previewKind == 4 ? vec3(0.03, 0.03, 0.045) : surfaceBaseColor;
}

// Physical raster UV → content image UV through the inverse corner-pin.
bool warpToContent(int idx, vec2 p, out vec2 q) {
  vec3 h = warpInv[idx] * vec3(p, 1.0);
  if (abs(h.z) < 1e-6) return false;
  q = h.xy / h.z;
  return q.x >= 0.0 && q.x <= 1.0 && q.y >= 0.0 && q.y <= 1.0;
}

// Does projector idx put light on this fragment? Returns content UV q.
bool projectorHit(int idx, out vec2 q) {
  q = vec2(0.0);
  if (idx >= projectorCount) return false;
  vec4 projClip = projectorMatrices[idx] * vec4(vWorldPos, 1.0);
  if (projClip.w <= 0.0) return false;
  vec3 ndc = projClip.xyz / projClip.w;
  if (abs(ndc.x) > 1.0 || abs(ndc.y) > 1.0 || abs(ndc.z) > 1.0) return false;
  vec2 p = ndc.xy * 0.5 + 0.5;
  if (!projectorVisibleAt(idx, p, ndc.z * 0.5 + 0.5)) return false;
  return warpToContent(idx, p, q);
}

float toLight(float w) {
  float x = clamp(w, 0.0, 1.0);
  return blendGammaCorrect == 1 ? x : pow(x, displayGamma);
}

float toSignal(float w) {
  float x = clamp(w, 0.0, 1.0);
  return blendGammaCorrect == 1 ? pow(x, 1.0 / displayGamma) : x;
}

void main() {
  // v4 content feed: the screen textures as this projector's camera sees them.
  if (feedIndex >= 0 && feedKind == 2) {
    if (!receivesOnThisFace() || hasScreenMap == 0) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    vec4 clip = projectorMatrices[feedIndex] * vec4(vWorldPos, 1.0);
    vec3 ndc = clip.xyz / max(clip.w, 1e-6);
    if (clip.w <= 0.0 || !projectorVisibleAt(feedIndex, ndc.xy * 0.5 + 0.5, ndc.z * 0.5 + 0.5)) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    fragColor = vec4(texture(screenMap, vSurfaceUv).rgb, 1.0);
    return;
  }

  // Full-frame layer of an output feed: the warped content feed (spill included).
  if (feedIndex >= 0 && feedLayer == 1) {
    vec2 p = gl_FragCoord.xy / feedSize;
    vec2 q;
    if (!warpToContent(feedIndex, p, q)) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    bool bgBlended = compositeMode == 1;
    float bgW = (bgBlended && blendMode == 0)
      ? pow(rawBlendWeight(q, blendEdges[feedIndex], outerEdgeFade[feedIndex]), blendGamma[feedIndex])
      : 1.0;
    float bgSignal = bgBlended ? toSignal(bgW) : 1.0;
    if (feedKind == 1) {
      fragColor = vec4(vec3(bgSignal), 1.0);
      return;
    }
    vec3 bg = sampleFeedAt(feedIndex, q) * brightness[feedIndex];
    float spill = feedView == 1 ? feedSpill : 1.0;
    fragColor = vec4(clamp(bg, 0.0, 1.0) * bgSignal * spill, 1.0);
    return;
  }

  if (!receivesOnThisFace()) {
    if (feedIndex >= 0 && feedLayer == 2) discard;
    fragColor = feedIndex >= 0 ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(unlitColor(), 1.0);
    return;
  }

  if (falloffPreview == 1 && feedIndex < 0) {
    float bestIntensity = 0.0;
    accumulateFalloffAt(0, bestIntensity);
    accumulateFalloffAt(1, bestIntensity);
    accumulateFalloffAt(2, bestIntensity);
    accumulateFalloffAt(3, bestIntensity);
    if (bestIntensity <= 0.0) {
      fragColor = vec4(surfaceBaseColor, 1.0);
      return;
    }
    fragColor = vec4(falloffHeatmap(bestIntensity), 1.0);
    return;
  }

  // Pass 1: which projectors light this point, and where in their image.
  bool hit[MAX_P];
  vec2 qs[MAX_P];
  int hitCount = 0;
  for (int i = 0; i < MAX_P; i++) {
    vec2 q;
    hit[i] = projectorHit(i, q);
    qs[i] = q;
    if (hit[i]) hitCount += 1;
  }

  if (feedIndex < 0 && previewKind == 2) {
    fragColor = vec4(uvGridColor(vSurfaceUv), 1.0);
    return;
  }

  if (hitCount == 0) {
    if (feedIndex >= 0 && feedLayer == 2) discard;
    fragColor = feedIndex >= 0 ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(unlitColor(), 1.0);
    return;
  }

  if (feedIndex < 0 && compositeMode == 2) {
    fragColor = vec4(heatmapColor(hitCount), 1.0);
    return;
  }

  // Pass 2: blend weights (light-space before gamma handling).
  float weights[MAX_P];
  float scoreSum = 0.0;
  for (int i = 0; i < MAX_P; i++) {
    weights[i] = 0.0;
    if (!hit[i]) continue;
    if (blendMode == 1) {
      weights[i] = pow(edgeScore(qs[i]), max(0.5, blendExponent));
      scoreSum += weights[i];
    } else {
      weights[i] = pow(rawBlendWeight(qs[i], blendEdges[i], outerEdgeFade[i]), blendGamma[i]);
    }
  }
  if (blendMode == 1) {
    for (int i = 0; i < MAX_P; i++) {
      if (!hit[i]) continue;
      weights[i] = scoreSum > 1e-9 ? weights[i] / scoreSum : 1.0 / float(hitCount);
    }
  }
  bool blended = compositeMode == 1;

  // Per-projector feed / mask (rendered from that projector's camera).
  if (feedIndex >= 0) {
    if (!hit[feedIndex]) {
      if (feedLayer == 2) discard;
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    float w = blended ? weights[feedIndex] : 1.0;
    float signal = blended ? toSignal(w) : 1.0;
    if (feedKind == 1) {
      fragColor = vec4(vec3(signal), 1.0);
      return;
    }
    vec3 c = sampleFeedAt(feedIndex, qs[feedIndex]) * brightness[feedIndex];
    vec3 outC = clamp(c, 0.0, 1.0) * signal;
    if (feedView == 1) {
      vec2 edgeDist = min(vSurfaceUv, 1.0 - vSurfaceUv) / max(fwidth(vSurfaceUv), vec2(1e-6));
      float edge = 1.0 - clamp(min(edgeDist.x, edgeDist.y) - 1.0, 0.0, 1.0);
      outC = mix(outC, vec3(0.35, 0.78, 0.98), edge);
    }
    fragColor = vec4(outC, 1.0);
    return;
  }

  // Pass 3: composite light on the surface.
  vec3 sumColor = vec3(0.0);
  float lightSum = 0.0;
  float luxSum = 0.0;
  float pxBest = 0.0;
  vec3 surfN = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
  for (int i = 0; i < MAX_P; i++) {
    if (!hit[i]) continue;
    float L = blended ? toLight(weights[i]) : 1.0;
    lightSum += L;
    if (previewKind == 3) luxSum += L * illuminanceFrom(i, surfN);
    if (previewKind == 4) pxBest = max(pxBest, pixelDensityFrom(i, surfN));
    vec3 color;
    if (forceUvPreview == 1) {
      color = vec3(qs[i], 0.2);
    } else {
      color = sampleFeedAt(i, qs[i]) * brightness[i];
    }
    sumColor += (1.0 - blackLevel) * color * L;
  }

  if (previewKind == 1) {
    fragColor = vec4(blendSumColor(lightSum), 1.0);
    return;
  }

  if (previewKind == 3 || previewKind == 4) {
    float value = illumUnit == 1 ? luxSum * screenGain / PI : luxSum;
    float t = previewKind == 4 ? pxBest / max(densityScaleMax, 1e-3) : value / max(illumScaleMax, 1e-3);
    vec3 c = illuminanceRamp(t);
    // Iso lines every 10 % of the scale.
    float steps = t * 10.0;
    float fw = max(fwidth(steps), 1e-4);
    float line = 1.0 - clamp(abs(fract(steps + 0.5) - 0.5) / fw, 0.0, 1.0);
    c = mix(c, c * 0.45, line * 0.7);
    fragColor = vec4(c, 1.0);
    return;
  }

  float floorCount = float(hitCount);
  if (blended && blackComp == 1) floorCount = max(floorCount, maxOverlap);
  sumColor += vec3(blackLevel * floorCount);

  if (blended && lightSum <= 0.00001 && blackLevel <= 0.0) {
    fragColor = vec4(surfaceBaseColor, 1.0);
    return;
  }

  fragColor = vec4(sumColor, 1.0);
}
