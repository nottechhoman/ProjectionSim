uniform mat4 projectorMatrix;
uniform sampler2D depthMap;
uniform sampler2D mediaMap;
uniform float depthBias;
uniform float brightness;
uniform int patternType;
uniform int useMediaTexture;
uniform int fitMode;
uniform float mediaAspect;
uniform float rasterAspect;
uniform vec3 projectorColor;
uniform int forceUvPreview;
uniform vec3 surfaceBaseColor;
uniform int mappingMode;
uniform int screenMapKind;
uniform mat4 screenMapMatrixInv;
uniform vec4 screenMapParams;

uniform int projectionSides;

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
  if (useMediaTexture == 1) {
    vec2 mediaUv = applyFit(contentUv);
    if (mediaUv.x < 0.0 || mediaUv.x > 1.0 || mediaUv.y < 0.0 || mediaUv.y > 1.0) discard;
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
    gl_FragColor = vec4(surfaceBaseColor, 1.0);
    return;
  }

  vec4 projClip = projectorMatrix * vec4(vWorldPos, 1.0);
  if (projClip.w <= 0.0) {
    gl_FragColor = vec4(surfaceBaseColor, 1.0);
    return;
  }

  vec3 projNDC = projClip.xyz / projClip.w;
  if (abs(projNDC.x) > 1.0 || abs(projNDC.y) > 1.0 || abs(projNDC.z) > 1.0) {
    gl_FragColor = vec4(surfaceBaseColor, 1.0);
    return;
  }

  vec2 uv = projNDC.xy * 0.5 + 0.5;
  vec2 contentUv = mappingMode == 1 ? sharedContentUv() : uv;

  float sceneDepth = texture2D(depthMap, uv).r;
  float fragDepth = projNDC.z * 0.5 + 0.5;
  if (fragDepth > sceneDepth + depthBias) {
    gl_FragColor = vec4(surfaceBaseColor * 0.45, 1.0);
    return;
  }

  vec3 color;
  if (forceUvPreview == 1) {
    color = mappingMode == 1 ? vec3(contentUv, 0.2) : vec3(uv, 0.2);
  } else if (mappingMode == 1) {
    color = sampleContent(contentUv);
  } else if (useMediaTexture == 1) {
    vec2 mediaUv = applyFit(uv);
    if (mediaUv.x < 0.0 || mediaUv.x > 1.0 || mediaUv.y < 0.0 || mediaUv.y > 1.0) discard;
    color = texture2D(mediaMap, mediaUv).rgb;
  } else if (patternType == 0) {
    float v = checker(uv);
    color = mix(vec3(0.1), vec3(0.9), v);
  } else if (patternType == 1) {
    color = vec3(uv, 0.0);
  } else if (patternType == 2) {
    color = vec3(uv.x, uv.y, 0.5);
  } else if (patternType == 4) {
    color = projectorColor;
  } else {
    color = vec3(1.0);
  }

  gl_FragColor = vec4(mix(surfaceBaseColor * 0.3, color, 1.0) * brightness, 1.0);
}
