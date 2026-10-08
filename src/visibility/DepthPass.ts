import * as THREE from 'three';

export class DepthPass {
  readonly target: THREE.WebGLRenderTarget;
  private readonly depthMaterial: THREE.MeshDepthMaterial;

  constructor(width = 512, height = 512) {
    this.target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.target.depthTexture = new THREE.DepthTexture(width, height);
    this.depthMaterial = new THREE.MeshDepthMaterial();
  }

  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    meshes: THREE.Mesh[],
  ): THREE.Texture {
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    // Clear once: with autoClear each mesh render would wipe the previous blockers.
    renderer.autoClear = false;
    const prevOverride = scene.overrideMaterial;
    scene.overrideMaterial = this.depthMaterial;
    try {
      meshes.forEach((m) => renderer.render(m, camera));
    } finally {
      scene.overrideMaterial = prevOverride;
      renderer.autoClear = prevAutoClear;
      renderer.setRenderTarget(prevTarget);
    }
    return this.target.depthTexture!;
  }

  dispose() {
    this.target.dispose();
    this.depthMaterial.dispose();
  }
}
