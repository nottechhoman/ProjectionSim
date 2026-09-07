import * as THREE from 'three';

/** Runtime cache of imported GLB/GLTF roots (cloned per scene instance) */
export const modelCache = new Map<string, THREE.Group>();
