uniform mat4 projectorMatrix;
uniform sampler2D depthMap;
uniform float depthBias;
uniform float brightness;
uniform int patternType; // 0 checker, 1 uv, 2 bars, 3 white, 4 id
uniform vec3 projectorColor;
uniform vec2 depthMapSize;

varying vec3 vWorldPos;

float checker(vec2 uv) {
  vec2 c = floor(uv * 16.0);
  return mod(c.x + c.y, 2.0);
}

void main() {
  vec4 projClip = projectorMatrix * vec4(vWorldPos, 1.0);
  if (projClip.w <= 0.0) discard;

  vec3 projNDC = projClip.xyz / projClip.w;
  if (abs(projNDC.x) > 1.0 || abs(projNDC.y) > 1.0 || abs(projNDC.z) > 1.0) discard;

  vec2 uv = projNDC.xy * 0.5 + 0.5;

  // Depth occlusion test
  vec2 depthUV = uv;
  float sceneDepth = texture2D(depthMap, depthUV).r;
  float fragDepth = projNDC.z * 0.5 + 0.5;
  if (fragDepth > sceneDepth + depthBias) discard;

  vec3 color;
  if (patternType == 0) {
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
