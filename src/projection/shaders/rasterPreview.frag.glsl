uniform sampler2D mediaMap;
uniform sampler2D canvasMap;
uniform int useContentCanvas;
uniform int useMediaTexture;
uniform int patternType;
uniform int fitMode;
uniform float mediaAspect;
uniform float rasterAspect;
uniform vec3 projectorColor;
uniform float brightness;
uniform vec4 blendEdges;
uniform float outerEdgeFade;
uniform float blendGamma;
uniform int screenMapKind;
uniform mat4 screenMapMatrixInv;
uniform vec4 screenMapParams;
uniform int projectionSides;
uniform mat4 projectorMatrix;

varying vec3 vWorldPos;
varying vec2 vSurfaceUv;

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

vec2 applyFit(vec2 uv) {
  if (fitMode == 2 || mediaAspect <= 0.0) return uv;
  float scaleX = 1.0;
  float scaleY = 1.0;
  if (fitMode == 0) {
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

vec3 sampleContent(vec2 contentUv) {
  if (useContentCanvas == 1) {
    if (contentUv.x < 0.0 || contentUv.x > 1.0 || contentUv.y < 0.0 || contentUv.y > 1.0) {
      return vec3(0.0);
    }
    return texture2D(canvasMap, contentUv).rgb;
  }
  if (useMediaTexture == 1) {
    vec2 mediaUv = applyFit(contentUv);
    if (mediaUv.x < 0.0 || mediaUv.x > 1.0 || mediaUv.y < 0.0 || mediaUv.y > 1.0) {
      return vec3(0.0);
    }
    return texture2D(mediaMap, mediaUv).rgb;
  }
  if (patternType == 0) {
    float v = checker(contentUv);
    return mix(vec3(0.1), vec3(0.9), v);
  }
  if (patternType == 1) {
    return vec3(contentUv, 0.0);
  }
  if (patternType == 2) {
    return vec3(contentUv.x, contentUv.y, 0.5);
  }
  if (patternType == 4) {
    return projectorColor;
  }
  return vec3(1.0);
}

void main() {
  if (!receivesOnThisFace()) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec4 projClip = projectorMatrix * vec4(vWorldPos, 1.0);
  if (projClip.w <= 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec3 projNDC = projClip.xyz / projClip.w;
  vec2 rasterUv = projNDC.xy * 0.5 + 0.5;

  vec2 contentUv = sharedContentUv();
  vec3 color = sampleContent(contentUv);
  float w = rawBlendWeight(rasterUv, blendEdges, outerEdgeFade);
  w = pow(w, blendGamma);
  gl_FragColor = vec4(color * w * brightness, 1.0);
}
