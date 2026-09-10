uniform sampler2D mediaMap;
uniform int useMediaTexture;
uniform int fitMode;
uniform float mediaAspect;
uniform float panelAspect;
uniform int displaySides;
uniform vec3 panelColor;

varying vec2 vSurfaceUv;

bool displaysOnThisFace() {
  if (displaySides >= 2) return true;
  if (displaySides == 0) return gl_FrontFacing;
  return !gl_FrontFacing;
}

vec2 applyFit(vec2 uv) {
  if (fitMode == 2 || mediaAspect <= 0.0) return uv;
  float scaleX = 1.0;
  float scaleY = 1.0;
  if (fitMode == 0) {
    if (mediaAspect > panelAspect) scaleY = panelAspect / mediaAspect;
    else scaleX = mediaAspect / panelAspect;
  } else {
    if (mediaAspect > panelAspect) scaleX = mediaAspect / panelAspect;
    else scaleY = panelAspect / mediaAspect;
  }
  return vec2((uv.x - 0.5) / scaleX + 0.5, (uv.y - 0.5) / scaleY + 0.5);
}

void main() {
  if (!displaysOnThisFace()) {
    gl_FragColor = vec4(0.04, 0.04, 0.05, 1.0);
    return;
  }

  vec2 uv = vSurfaceUv;
  vec3 color = panelColor;

  if (useMediaTexture == 1) {
    vec2 mediaUv = applyFit(uv);
    if (mediaUv.x >= 0.0 && mediaUv.x <= 1.0 && mediaUv.y >= 0.0 && mediaUv.y <= 1.0) {
      color = texture2D(mediaMap, mediaUv).rgb;
    }
  }

  gl_FragColor = vec4(color, 1.0);
}
