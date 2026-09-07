#define MAX_P 4

uniform mat4 projectorMatrices[MAX_P];
uniform sampler2D depthMaps[MAX_P];
uniform sampler2D mediaMaps[MAX_P];
uniform float depthBias;
uniform float brightness[MAX_P];
uniform float patternTypes[MAX_P];
uniform float useMediaTexture[MAX_P];
uniform float fitModes[MAX_P];
uniform float mediaAspects[MAX_P];
uniform float rasterAspects[MAX_P];
uniform vec3 projectorColors[MAX_P];
uniform vec4 blendEdges[MAX_P];
uniform float outerEdgeFade[MAX_P];
uniform vec2 depthMapSize;
uniform int projectorCount;
uniform int compositeMode;

varying vec3 vWorldPos;

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

vec3 sampleProjectorColor(int idx, vec2 uv) {
  float pType = patternTypes[idx];
  float useMedia = useMediaTexture[idx];
  if (useMedia > 0.5) {
    vec2 mediaUv = applyFit(uv, fitModes[idx], mediaAspects[idx], rasterAspects[idx]);
    if (mediaUv.x < 0.0 || mediaUv.x > 1.0 || mediaUv.y < 0.0 || mediaUv.y > 1.0) {
      return vec3(0.0);
    }
    return texture2D(mediaMaps[idx], mediaUv).rgb;
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

bool projectorVisible(int idx, vec2 uv, float fragDepth) {
  float sceneDepth = texture2D(depthMaps[idx], uv).r;
  return fragDepth <= sceneDepth + depthBias;
}

vec3 heatmapColor(int count) {
  if (count <= 0) return vec3(0.05);
  if (count == 1) return vec3(0.2, 0.75, 0.35);
  if (count == 2) return vec3(0.95, 0.85, 0.2);
  return vec3(0.95, 0.3, 0.25);
}

void main() {
  vec3 sumColor = vec3(0.0);
  float sumWeight = 0.0;
  int hitCount = 0;

  for (int i = 0; i < MAX_P; i++) {
    if (i >= projectorCount) break;

    vec4 projClip = projectorMatrices[i] * vec4(vWorldPos, 1.0);
    if (projClip.w <= 0.0) continue;

    vec3 projNDC = projClip.xyz / projClip.w;
    if (abs(projNDC.x) > 1.0 || abs(projNDC.y) > 1.0 || abs(projNDC.z) > 1.0) continue;

    vec2 uv = projNDC.xy * 0.5 + 0.5;
    float fragDepth = projNDC.z * 0.5 + 0.5;
    if (!projectorVisible(i, uv, fragDepth)) continue;

    hitCount++;
    vec3 color = sampleProjectorColor(i, uv) * brightness[i];
    float w = rawBlendWeight(uv, blendEdges[i], outerEdgeFade[i]);

    if (compositeMode == 0) {
      sumColor += color;
      sumWeight += 1.0;
    } else if (compositeMode == 1) {
      sumColor += color * w;
      sumWeight += w;
    }
  }

  if (compositeMode == 2) {
    if (hitCount == 0) discard;
    gl_FragColor = vec4(heatmapColor(hitCount), 1.0);
    return;
  }

  if (sumWeight <= 0.0) discard;

  if (compositeMode == 1) {
    gl_FragColor = vec4(sumColor / sumWeight, 1.0);
  } else {
    gl_FragColor = vec4(sumColor, 1.0);
  }
}
