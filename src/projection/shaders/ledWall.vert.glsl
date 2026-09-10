varying vec2 vSurfaceUv;

void main() {
  vSurfaceUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
