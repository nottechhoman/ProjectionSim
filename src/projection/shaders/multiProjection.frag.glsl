// NAPT Advanced (v2) — unified projector compositing shader.
// Handles 1–4 projectors, corner-pin warp, per-surface UV mapping, manual and
// geometry-aware auto edge blending, display-gamma handling, black-level
// simulation/compensation, analysis previews and per-projector feed rendering.
// CPU mirrors: src/blending/advancedBlend.ts, src/uvmapping/surfaceUv.ts,
// src/warp/homography.ts — keep them in sync.

#define MAX_P 4

uniform mat4 projectorMatrices[MAX_P];
uniform sampler2D depthMaps[MAX_P];
uniform sampler2D mediaMaps[MAX_P];
uniform float depthBias;
uniform int useOcclusion;
uniform float brightness[MAX_P];
uniform float patternTypes[MAX_P];
uniform float useMediaTexture[MAX_P];
uniform float fitModes[MAX_P];
uniform float mediaAspects[MAX_P];
uniform float rasterAspects[MAX_P];
uniform vec3 projectorColors[MAX_P];
uniform vec4 blendEdges[MAX_P];
uniform float outerEdgeFade[MAX_P];
uniform float blendGamma[MAX_P];
uniform vec2 depthMapSize;
uniform int projectorCount;
uniform int compositeMode;
uniform int forceUvPreview;
uniform vec3 surfaceBaseColor;
uniform int mappingMode;
uniform int screenMapKind;
uniform mat4 screenMapMatrixInv;
uniform vec4 screenMapParams;
uniform int sharedUseMediaTexture;
uniform sampler2D sharedMediaMap;
uniform float sharedPatternType;
uniform float sharedFitMode;
uniform float sharedMediaAspect;
uniform float sharedRasterAspect;
uniform vec3 sharedProjectorColor;
uniform float sharedBrightness;

uniform int useContentCanvas;
uniform sampler2D canvasMap;

uniform int projectionSides;
uniform int falloffPreview;
uniform vec3 projectorWorldPos[MAX_P];
uniform float falloffRefDistance[MAX_P];

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
uniform int previewKind;        // 0 normal, 1 blend sum, 2 surface UV
uniform int feedIndex;          // -1 scene view; >= 0 render that projector's feed
uniform int feedKind;           // 0 colour feed, 1 blend mask only

// ---- v2: per-surface UV mapping (set per mesh) -----------------------------
uniform int surfMap;
uniform int surfProj;           // 0 mesh UV, 1 planar, 2 cylindrical, 3 spherical
uniform int surfAxes;           // planar: 0 XY, 1 XZ, 2 ZY
uniform mat4 surfRootInv;
uniform vec3 surfBoundsMin;
uniform vec3 surfBoundsSize;
uniform vec3 surfTheta;         // ref, min, max
uniform vec2 surfPhi;           // min, max
uniform vec4 surfRegion;        // x, y, w, h (top-left origin)
uniform vec4 surfXform;         // rotation rad, flipU, flipV, wrap
uniform vec2 surfRepeat;

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

vec2 applyFit(vec2 uv, float fitMode, float mediaAspect, float rasterAspect) {
  if (fitMode >= 1.5 || mediaAspect <= 0.0) return uv;
  float scaleX = 1.0;
  float scaleY = 1.0;
  if (fitMode < 0.5) {
    if (mediaAspect > rasterAspect) scaleY = rasterAspect / mediaAspect;
    else scaleX = mediaAspect / rasterAspect;
  } else {
    if (mediaAspect > rasterAspect) scaleX = mediaAspect / rasterAspect;
    else scaleY = rasterAspect / mediaAspect;
  }
  return vec2((uv.x - 0.5) / scaleX + 0.5, (uv.y - 0.5) / scaleY + 0.5);
}

vec2 sharedContentUv() {
  if (screenMapKind == 3) return vSurfaceUv;
  vec3 local = (screenMapMatrixInv * vec4(vWorldPos, 1.0)).xyz;
  if (screenMapKind == 1) {
    return vec2(local.x / screenMapParams.x + 0.5, local.y / screenMapParams.y + 0.5);
  }
  if (screenMapKind == 2) {
    float theta = atan(local.z, local.x);
    float arcRad = screenMapParams.z * 0.01745329252;
    float u = (theta + arcRad * 0.5) / arcRad;
    float v = (local.y + screenMapParams.y * 0.5) / screenMapParams.y;
    return vec2(u, v);
  }
  return vec2(0.0);
}

float wrapPi(float a) {
  return a - 2.0 * PI * floor((a + PI) / (2.0 * PI));
}

// Raw 0–1 surface UV of this fragment for the mesh's projection type.
vec2 rawSurfaceUv() {
  if (surfProj == 0) return vSurfaceUv;
  vec3 l = (surfRootInv * vec4(vWorldPos, 1.0)).xyz;
  vec3 mn = surfBoundsMin;
  vec3 sz = max(surfBoundsSize, vec3(1e-6));
  if (surfProj == 1) {
    if (surfAxes == 1) return vec2((l.x - mn.x) / sz.x, (mn.z + sz.z - l.z) / sz.z);
    if (surfAxes == 2) return vec2((mn.z + sz.z - l.z) / sz.z, (l.y - mn.y) / sz.y);
    return vec2((l.x - mn.x) / sz.x, (l.y - mn.y) / sz.y);
  }
  float t = wrapPi(atan(l.x, l.z) - surfTheta.x);
  float u = (surfTheta.z - t) / max(1e-6, surfTheta.z - surfTheta.y);
  if (surfProj == 2) return vec2(u, (l.y - mn.y) / sz.y);
  float f = atan(l.y, max(length(l.xz), 1e-6));
  return vec2(u, (f - surfPhi.x) / max(1e-6, surfPhi.y - surfPhi.x));
}

float wrapScalar(float x, float mode, inout bool ok) {
  if (mode > 1.5) {
    float m = x - 2.0 * floor(x / 2.0);
    return m > 1.0 ? 2.0 - m : m;
  }
  if (mode > 0.5) return fract(x);
  if (x < -1e-4 || x > 1.0001) ok = false;
  return clamp(x, 0.0, 1.0);
}

// Surface UV → content UV (bottom-left origin). ok=false when clamped out.
vec2 surfaceContentUv(out bool ok) {
  ok = true;
  vec2 s = rawSurfaceUv();
  if (surfXform.y > 0.5) s.x = 1.0 - s.x;
  if (surfXform.z > 0.5) s.y = 1.0 - s.y;
  float a = surfXform.x;
  if (a != 0.0) {
    vec2 c = s - 0.5;
    float ca = cos(a);
    float sa = sin(a);
    s = vec2(ca * c.x - sa * c.y, sa * c.x + ca * c.y) + 0.5;
  }
  s *= surfRepeat;
  s.x = wrapScalar(s.x, surfXform.w, ok);
  s.y = wrapScalar(s.y, surfXform.w, ok);
  return vec2(surfRegion.x + s.x * surfRegion.z, 1.0 - surfRegion.y - surfRegion.w + s.y * surfRegion.w);
}

vec2 contentUvForSurface(out bool ok) {
  ok = true;
  if (surfMap == 1) return surfaceContentUv(ok);
  return sharedContentUv();
}

vec3 patternColor(float pType, vec2 uv, vec3 tint) {
  if (pType < 0.5) {
    return mix(vec3(0.1), vec3(0.9), checker(uv));
  } else if (pType < 1.5) {
    return vec3(uv, 0.0);
  } else if (pType < 2.5) {
    return vec3(uv.x, uv.y, 0.5);
  } else if (pType < 3.5) {
    return vec3(1.0);
  } else if (pType < 4.5) {
    return tint;
  } else if (pType < 5.5) {
    return vec3(0.0);
  }
  return vec3(0.5);
}

vec3 sampleSharedContent(vec2 contentUv) {
  if (useContentCanvas == 1) {
    if (contentUv.x < 0.0 || contentUv.x > 1.0 ||
        contentUv.y < 0.0 || contentUv.y > 1.0) return vec3(0.0);
    return texture(canvasMap, contentUv).rgb;
  }
  if (sharedUseMediaTexture == 1) {
    vec2 mediaUv = applyFit(contentUv, sharedFitMode, sharedMediaAspect, sharedRasterAspect);
    if (mediaUv.x < 0.0 || mediaUv.x > 1.0 || mediaUv.y < 0.0 || mediaUv.y > 1.0) {
      return vec3(0.0);
    }
    return texture(sharedMediaMap, mediaUv).rgb;
  }
  return patternColor(sharedPatternType, contentUv, sharedProjectorColor);
}

// WebGL2 requires constant sampler indices — branch on projector slot.
vec3 sampleMediaAt(int idx, vec2 mediaUv) {
  if (idx == 0) return texture(mediaMaps[0], mediaUv).rgb;
  if (idx == 1) return texture(mediaMaps[1], mediaUv).rgb;
  if (idx == 2) return texture(mediaMaps[2], mediaUv).rgb;
  return texture(mediaMaps[3], mediaUv).rgb;
}

float sampleDepthAt(int idx, vec2 uv) {
  if (idx == 0) return texture(depthMaps[0], uv).r;
  if (idx == 1) return texture(depthMaps[1], uv).r;
  if (idx == 2) return texture(depthMaps[2], uv).r;
  return texture(depthMaps[3], uv).r;
}

vec3 sampleProjectorColorAt(int idx, vec2 uv) {
  if (useMediaTexture[idx] > 0.5) {
    vec2 mediaUv = applyFit(uv, fitModes[idx], mediaAspects[idx], rasterAspects[idx]);
    if (mediaUv.x < 0.0 || mediaUv.x > 1.0 || mediaUv.y < 0.0 || mediaUv.y > 1.0) {
      return vec3(0.0);
    }
    return sampleMediaAt(idx, mediaUv);
  }
  return patternColor(patternTypes[idx], uv, projectorColors[idx]);
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
  if (!receivesOnThisFace()) {
    fragColor = feedIndex >= 0 ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(surfaceBaseColor, 1.0);
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

  bool surfOk;
  vec2 contentUv = contentUvForSurface(surfOk);
  bool sharedMapping = mappingMode == 1;

  if (feedIndex < 0 && previewKind == 2) {
    vec2 uvShow = (sharedMapping || surfMap == 1) ? contentUv : (hitCount > 0 ? qs[0] : vSurfaceUv);
    if (!surfOk) {
      fragColor = vec4(surfaceBaseColor * 0.5, 1.0);
      return;
    }
    fragColor = vec4(uvGridColor(uvShow), 1.0);
    return;
  }

  if (hitCount == 0) {
    fragColor = feedIndex >= 0 ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(surfaceBaseColor, 1.0);
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
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    float w = blended ? weights[feedIndex] : 1.0;
    float signal = blended ? toSignal(w) : 1.0;
    if (feedKind == 1) {
      fragColor = vec4(vec3(signal), 1.0);
      return;
    }
    vec3 c;
    if (sharedMapping) {
      c = surfOk ? sampleSharedContent(contentUv) : vec3(0.0);
      c *= useContentCanvas == 1 ? brightness[feedIndex] : sharedBrightness;
    } else {
      c = sampleProjectorColorAt(feedIndex, qs[feedIndex]) * brightness[feedIndex];
    }
    fragColor = vec4(clamp(c, 0.0, 1.0) * signal, 1.0);
    return;
  }

  // Pass 3: composite light on the surface.
  vec3 sumColor = vec3(0.0);
  float lightSum = 0.0;
  for (int i = 0; i < MAX_P; i++) {
    if (!hit[i]) continue;
    float L = blended ? toLight(weights[i]) : 1.0;
    lightSum += L;
    vec3 color;
    if (forceUvPreview == 1) {
      color = sharedMapping ? vec3(contentUv, 0.2) : vec3(qs[i], 0.2);
    } else if (sharedMapping) {
      color = surfOk ? sampleSharedContent(contentUv) : vec3(0.0);
      color *= useContentCanvas == 1 ? brightness[i] : sharedBrightness;
    } else {
      color = sampleProjectorColorAt(i, qs[i]) * brightness[i];
    }
    sumColor += (1.0 - blackLevel) * color * L;
  }

  if (previewKind == 1) {
    fragColor = vec4(blendSumColor(lightSum), 1.0);
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
