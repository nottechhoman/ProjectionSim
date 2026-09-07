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
uniform vec2 depthMapSize;

varying vec3 vWorldPos;

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

void main() {
  vec4 projClip = projectorMatrix * vec4(vWorldPos, 1.0);
  if (projClip.w <= 0.0) discard;

  vec3 projNDC = projClip.xyz / projClip.w;
  if (abs(projNDC.x) > 1.0 || abs(projNDC.y) > 1.0 || abs(projNDC.z) > 1.0) discard;

  vec2 uv = projNDC.xy * 0.5 + 0.5;

  float sceneDepth = texture2D(depthMap, uv).r;
  float fragDepth = projNDC.z * 0.5 + 0.5;
  if (fragDepth > sceneDepth + depthBias) discard;

  vec3 color;
  if (useMediaTexture == 1) {
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

  gl_FragColor = vec4(color * brightness, 1.0);
}
