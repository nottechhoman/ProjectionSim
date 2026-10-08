// Screen-texture bake: rasterize the mesh in its own UV layout so every texel
// knows its world position.
out vec3 vWorld;
out vec2 vUv;

void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vUv = uv;
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}
