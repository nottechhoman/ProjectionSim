import * as THREE from 'three';

/** YXZ order — yaw around Y, pitch around X, roll around Z */
export function eulerYXZToQuaternion(
  yawDeg: number,
  pitchDeg: number,
  rollDeg: number,
): [number, number, number, number] {
  const e = new THREE.Euler(
    THREE.MathUtils.degToRad(pitchDeg),
    THREE.MathUtils.degToRad(yawDeg),
    THREE.MathUtils.degToRad(rollDeg),
    'YXZ',
  );
  const q = new THREE.Quaternion().setFromEuler(e);
  return [q.x, q.y, q.z, q.w];
}

export function quaternionToEulerYXZ(
  q: [number, number, number, number],
): { yaw: number; pitch: number; roll: number } {
  const quat = new THREE.Quaternion(...q);
  const e = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
  return {
    yaw: THREE.MathUtils.radToDeg(e.y),
    pitch: THREE.MathUtils.radToDeg(e.x),
    roll: THREE.MathUtils.radToDeg(e.z),
  };
}
