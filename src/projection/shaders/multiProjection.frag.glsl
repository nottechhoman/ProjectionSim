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

in vec3 vWorldPos;
in vec2 vSurfaceUv;
out vec4 fragColor;

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
  if (sharedPatternType < 0.5) {
    float v = checker(contentUv);
    return mix(vec3(0.1), vec3(0.9), v);
  } else if (sharedPatternType < 1.5) {
    return vec3(contentUv, 0.0);
  } else if (sharedPatternType < 2.5) {
    return vec3(contentUv.x, contentUv.y, 0.5);
  } else if (sharedPatternType < 3.5) {
    return vec3(1.0);
  }
  return sharedProjectorColor;
}

// WebGL2 requires constant sampler indices — branch on projector slot instead of mediaMaps[idx].
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
  float pType = patternTypes[idx];
  float useMedia = useMediaTexture[idx];
  if (useMedia > 0.5) {
    vec2 mediaUv = applyFit(uv, fitModes[idx], mediaAspects[idx], rasterAspects[idx]);
    if (mediaUv.x < 0.0 || mediaUv.x > 1.0 || mediaUv.y < 0.0 || mediaUv.y > 1.0) {
      return vec3(0.0);
    }
    return sampleMediaAt(idx, mediaUv);
  }
  if (pType < 0.5) {
    float v = checker(uv);
    return mix(vec3(0.1), vec3(0.9), v);
  } else if (pType < 1.5) {
    return vec3(uv, 0.0);
  } else if (pType < 2.5) {
    return vec3(uv.x, uv.y, 0.5);
  } else if (pType < 3.5) {
    return vec3(1.0);
  }
  return projectorColors[idx];
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

void accumulateProjectionAt(int idx, inout vec3 sumColor, inout float sumWeight, inout int hitCount) {
  if (idx >= projectorCount) return;

  vec4 projClip = projectorMatrices[idx] * vec4(vWorldPos, 1.0);
  if (projClip.w <= 0.0) return;

  vec3 projNDC = projClip.xyz / projClip.w;
  if (abs(projNDC.x) > 1.0 || abs(projNDC.y) > 1.0 || abs(projNDC.z) > 1.0) return;

  vec2 uv = projNDC.xy * 0.5 + 0.5;
  vec2 contentUv = mappingMode == 1 ? sharedContentUv() : uv;
  float fragDepth = projNDC.z * 0.5 + 0.5;
  if (!projectorVisibleAt(idx, uv, fragDepth)) return;

  hitCount += 1;
  vec3 color;
  if (forceUvPreview == 1) {
    color = mappingMode == 1 ? vec3(contentUv, 0.2) : vec3(uv, 0.2);
  } else if (mappingMode == 1) {
    color = sampleSharedContent(contentUv);
    if (useContentCanvas == 1) {
      color *= brightness[idx];
    } else {
      color *= sharedBrightness;
    }
  } else {
    color = sampleProjectorColorAt(idx, uv) * brightness[idx];
  }
  float w = rawBlendWeight(uv, blendEdges[idx], outerEdgeFade[idx]);
  // Linear-light output: gamma 1 keeps matched ramps seamless; higher simulates uncorrected crossover.
  w = pow(w, blendGamma[idx]);

  if (compositeMode == 0) {
    sumColor += color;
    sumWeight += 1.0;
  } else if (compositeMode == 1) {
    sumColor += color * w;
    sumWeight += w;
  }
}

void main() {
  if (!receivesOnThisFace()) {
    fragColor = vec4(surfaceBaseColor, 1.0);
    return;
  }

  if (falloffPreview == 1) {
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

  vec3 sumColor = vec3(0.0);
  float sumWeight = 0.0;
  int hitCount = 0;

  accumulateProjectionAt(0, sumColor, sumWeight, hitCount);
  accumulateProjectionAt(1, sumColor, sumWeight, hitCount);
  accumulateProjectionAt(2, sumColor, sumWeight, hitCount);
  accumulateProjectionAt(3, sumColor, sumWeight, hitCount);

  if (compositeMode == 2) {
    if (hitCount == 0) {
      fragColor = vec4(surfaceBaseColor, 1.0);
      return;
    }
    fragColor = vec4(heatmapColor(hitCount), 1.0);
    return;
  }

  if (hitCount == 0) {
    fragColor = vec4(surfaceBaseColor, 1.0);
    return;
  }

  if (compositeMode == 1 && sumWeight <= 0.00001) {
    fragColor = vec4(surfaceBaseColor, 1.0);
    return;
  }

  fragColor = vec4(sumColor, 1.0);
}
