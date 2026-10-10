// v4 screen-texture bake — one draw per (screen, layer); GL blending composites
// layers bottom to top. CPU mirror: src/mapping/sample.ts — keep them in sync.

// mapping
uniform int mapKind;          // 0 direct, 1 perspective, 2 parallel, 3 feed, 4 cylindrical, 5 spherical
uniform mat4 mapMatrix;       // perspective: view-projection; parallel/cyl/sph: inverse frame
uniform vec4 mapParams;       // parallel: size w,h · cyl: arc rad, height · sph: arc rad, elevation rad
uniform vec2 mapRes;          // mapping canvas pixels
uniform int directFit;        // 0 stretch, 1 fit, 2 crop, 3 pixel
uniform float screenAspect;   // physical aspect of the screen texture layout
uniform vec2 screenTexSize;

// feed rect for this screen (surface UV projections fitted to the object's bounds)
uniform int surfProj;         // 0 mesh UV, 1 planar, 2 cylindrical, 3 spherical
uniform int surfAxes;         // planar: 0 XY, 1 XZ, 2 ZY
uniform mat4 surfRootInv;
uniform vec3 surfBoundsMin;
uniform vec3 surfBoundsSize;
uniform vec3 surfTheta;       // ref, min, max
uniform vec2 surfPhi;         // min, max
uniform vec4 surfRegion;      // x, y, w, h (top-left origin)
uniform vec4 surfXform;       // rotation rad, flipU, flipV, wrap
uniform vec2 surfRepeat;

// layer
uniform int mediaKind;        // 0 nothing, 1 texture, 2 pattern, 3 solid
uniform sampler2D mediaMap;
uniform float mediaAspect;
uniform int patternType;
uniform vec3 layerColor;
uniform vec4 layerRect;       // x, y, w, h normalized, top-left origin
uniform float layerRot;       // radians
uniform int layerFit;         // 0 contain, 1 cover, 2 stretch
uniform float layerOpacity;
// 0 normal, 1 add, 2 multiply (GPU blending); 3+ read the texture below (dstMap):
// 3 screen, 4 overlay, 5 soft light, 6 lighten, 7 darken, 8 difference.
uniform int blendMode;
uniform sampler2D dstMap;

// v4 M4: mapping filtering (0 nearest, 1 bilinear, 2 two-sample supersampling)
// and mask (luminance of an image over the mapping canvas multiplies the layer).
uniform int filterMode;
uniform sampler2D maskMap;
uniform int hasMask;

in vec3 vWorld;
in vec2 vUv;
out vec4 fragColor;

// The sample point being shaded (texel centre, or a sub-sample of it).
vec3 gP;
vec2 gT;

const float PI = 3.14159265359;

float wrapPi(float a) {
  return a - 2.0 * PI * floor((a + PI) / (2.0 * PI));
}

bool inUnit(vec2 p) {
  return p.x >= 0.0 && p.x <= 1.0 && p.y >= 0.0 && p.y <= 1.0;
}

vec2 rawSurfaceUv() {
  if (surfProj == 0) return gT;
  vec3 l = (surfRootInv * vec4(gP, 1.0)).xyz;
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

bool feedUv(out vec2 uv) {
  bool ok = true;
  vec2 s = rawSurfaceUv();
  if (surfXform.y > 0.5) s.x = 1.0 - s.x;
  if (surfXform.z > 0.5) s.y = 1.0 - s.y;
  float a = surfXform.x;
  if (a != 0.0) {
    vec2 c = s - 0.5;
    s = vec2(cos(a) * c.x - sin(a) * c.y, sin(a) * c.x + cos(a) * c.y) + 0.5;
  }
  s *= surfRepeat;
  s.x = wrapScalar(s.x, surfXform.w, ok);
  s.y = wrapScalar(s.y, surfXform.w, ok);
  uv = vec2(surfRegion.x + s.x * surfRegion.z, 1.0 - surfRegion.y - surfRegion.w + s.y * surfRegion.w);
  return ok;
}

bool directUv(out vec2 uv) {
  uv = gT;
  if (directFit == 3) {
    uv = (gT - 0.5) * (screenTexSize / mapRes) + 0.5;
  } else if (directFit != 0) {
    float canvasAspect = mapRes.x / mapRes.y;
    vec2 sc = vec2(1.0);
    bool wider = canvasAspect > screenAspect;
    if (directFit == 1) {
      if (wider) sc.y = screenAspect / canvasAspect; else sc.x = canvasAspect / screenAspect;
    } else {
      if (wider) sc.x = canvasAspect / screenAspect; else sc.y = screenAspect / canvasAspect;
    }
    uv = (gT - 0.5) / sc + 0.5;
  }
  return inUnit(uv);
}

// Texel → mapping canvas UV (bottom-left origin).
bool canvasUv(out vec2 uv) {
  uv = vec2(0.0);
  if (mapKind == 0) return directUv(uv);
  if (mapKind == 3) return feedUv(uv);
  if (mapKind == 1) {
    vec4 clip = mapMatrix * vec4(gP, 1.0);
    if (clip.w <= 1e-6) return false;
    uv = clip.xy / clip.w * 0.5 + 0.5;
    return inUnit(uv);
  }
  vec3 l = (mapMatrix * vec4(gP, 1.0)).xyz;
  if (mapKind == 2) {
    uv = vec2(l.x / mapParams.x + 0.5, l.y / mapParams.y + 0.5);
    return inUnit(uv);
  }
  float t = wrapPi(atan(l.x, l.z));
  if (mapKind == 4) {
    uv = vec2(0.5 - t / mapParams.x, l.y / mapParams.y + 0.5);
    return inUnit(uv);
  }
  float f = atan(l.y, max(length(l.xz), 1e-6));
  uv = vec2(0.5 - t / mapParams.x, f / mapParams.y + 0.5);
  return inUnit(uv);
}

// Canvas UV → layer media UV (bottom-left); false outside the rect / letterbox.
bool layerUv(vec2 c, out vec2 m) {
  m = vec2(0.0);
  vec2 px = vec2(c.x, 1.0 - c.y) * mapRes;
  vec2 rs = layerRect.zw * mapRes;
  vec2 rc = layerRect.xy * mapRes + rs * 0.5;
  if (layerRot != 0.0) {
    float a = -layerRot;
    vec2 d = px - rc;
    px = rc + vec2(cos(a) * d.x - sin(a) * d.y, sin(a) * d.x + cos(a) * d.y);
  }
  vec2 l = (px - (rc - rs * 0.5)) / rs;
  if (!inUnit(l)) return false;
  if (layerFit != 2 && mediaAspect > 0.0) {
    float ra = rs.x / rs.y;
    vec2 sc = vec2(1.0);
    if (layerFit == 0) {
      if (mediaAspect > ra) sc.y = ra / mediaAspect; else sc.x = mediaAspect / ra;
    } else {
      if (mediaAspect > ra) sc.x = mediaAspect / ra; else sc.y = ra / mediaAspect;
    }
    l = (l - 0.5) / sc + 0.5;
    if (!inUnit(l)) return false;
  }
  m = vec2(l.x, 1.0 - l.y);
  return true;
}

float checker(vec2 uv) {
  vec2 c = floor(uv * 16.0);
  return mod(c.x + c.y, 2.0);
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

vec3 toLinear(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

// Pattern levels are signal values (Gray 50 % = code 128): decoded to linear in
// shadeAt like images. The tint (4) is a decoded colour already.
vec3 patternColor(int p, vec2 uv, vec3 tint) {
  if (p == 0) return mix(vec3(0.1), vec3(0.9), checker(uv));
  if (p == 1) return vec3(uv, 0.0);
  if (p == 2) return vec3(uv.x, uv.y, 0.5);
  if (p == 3) return vec3(1.0);
  if (p == 4) return tint;
  if (p == 5) return vec3(0.0);
  return vec3(0.5);
}

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// Colour and weight (coverage × mask) of the layer at one sample point.
vec4 shadeAt(vec3 P, vec2 T) {
  gP = P;
  gT = T;
  vec2 c;
  if (!canvasUv(c)) return vec4(0.0);
  // Nearest: snap to the mapping canvas pixel centre.
  if (filterMode == 0) c = (floor(c * mapRes) + 0.5) / mapRes;
  vec2 m;
  if (!layerUv(c, m)) return vec4(0.0);
  vec3 col;
  if (mediaKind == 1) {
    if (filterMode == 0) {
      ivec2 sz = textureSize(mediaMap, 0);
      col = texelFetch(mediaMap, clamp(ivec2(m * vec2(sz)), ivec2(0), sz - 1), 0).rgb;
    } else {
      col = texture(mediaMap, m).rgb;
    }
  } else if (mediaKind == 2) {
    col = patternColor(patternType, m, layerColor);
    if (patternType != 4) col = toLinear(col);
  }
  else if (mediaKind == 3) col = layerColor;
  else return vec4(0.0);
  float mask = hasMask == 1 ? clamp(dot(texture(maskMap, c).rgb, LUMA), 0.0, 1.0) : 1.0;
  return vec4(col, mask);
}

// Mirror of blendChannel() in src/mapping/sample.ts. d = below, s = layer (sRGB-encoded).
vec3 blendChannel(vec3 d, vec3 s) {
  if (blendMode == 3) return 1.0 - (1.0 - d) * (1.0 - s);
  if (blendMode == 4) return mix(2.0 * d * s, 1.0 - 2.0 * (1.0 - d) * (1.0 - s), step(0.5 + 1e-6, d));
  if (blendMode == 5) {
    vec3 g = mix(((16.0 * d - 12.0) * d + 4.0) * d, sqrt(d), step(0.25 + 1e-6, d));
    vec3 dark = d - (1.0 - 2.0 * s) * d * (1.0 - d);
    vec3 light = d + (2.0 * s - 1.0) * (g - d);
    return mix(dark, light, step(0.5 + 1e-6, s));
  }
  if (blendMode == 6) return max(d, s);
  if (blendMode == 7) return min(d, s);
  return abs(d - s);
}

void main() {
  // Derivatives first (outside any branch).
  vec3 dx = dFdx(vWorld);
  vec3 dy = dFdy(vWorld);
  vec2 tx = dFdx(vUv);
  vec2 ty = dFdy(vUv);
  vec4 s;
  if (filterMode == 2) {
    // Two rotated-grid sub-samples per texel.
    vec4 a = shadeAt(vWorld - 0.25 * dx + 0.25 * dy, vUv - 0.25 * tx + 0.25 * ty);
    vec4 b = shadeAt(vWorld + 0.25 * dx - 0.25 * dy, vUv + 0.25 * tx - 0.25 * ty);
    float w = a.a + b.a;
    if (w <= 0.0) discard;
    s = vec4((a.rgb * a.a + b.rgb * b.a) / w, w * 0.5);
  } else {
    s = shadeAt(vWorld, vUv);
    if (s.a <= 0.0) discard;
  }
  float a = clamp(layerOpacity, 0.0, 1.0) * s.a;
  // Blend factors are set per mode on the material (see ScreenTextureBaker).
  if (blendMode >= 3) {
    // dstMap is a copy of this target before the layer; the bake raster is the texture.
    vec3 below = texture(dstMap, gl_FragCoord.xy / screenTexSize).rgb;
    vec3 mixed = toLinear(blendChannel(toSrgb(below), toSrgb(s.rgb)));
    fragColor = vec4(mix(below, mixed, a), 1.0);
  } else if (blendMode == 2) fragColor = vec4(mix(vec3(1.0), s.rgb, a), 1.0);
  else fragColor = vec4(s.rgb, a);
}
