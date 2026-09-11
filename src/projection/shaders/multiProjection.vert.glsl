out vec3 vWorldPos;
out vec2 vSurfaceUv;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vSurfaceUv = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
