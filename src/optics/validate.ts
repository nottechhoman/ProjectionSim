import type { ProjectorOptics } from '../types';

export function validateOptics(
  optics: ProjectorOptics,
): { valid: boolean; error?: string } {
  const { throwRatio, resolution, aspectRatio, nearLimit, farLimit } = optics;
  if (!Number.isFinite(throwRatio) || throwRatio <= 0) {
    return { valid: false, error: 'Throw ratio must be a positive number' };
  }
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return { valid: false, error: 'Aspect ratio must be positive' };
  }
  if (resolution.width <= 0 || resolution.height <= 0) {
    return { valid: false, error: 'Resolution must be positive' };
  }
  if (nearLimit <= 0 || farLimit <= nearLimit) {
    return { valid: false, error: 'Near/far limits invalid' };
  }
  return { valid: true };
}
