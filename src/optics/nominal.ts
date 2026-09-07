import type { ProjectorOptics, NominalProjection } from '../types';

export function computeNominalProjection(
  optics: ProjectorOptics,
  distance: number,
): NominalProjection {
  const T = optics.throwRatio;
  const A = optics.aspectRatio;
  const width = distance / T;
  const height = width / A;
  const diagonal = Math.sqrt(width * width + height * height);
  const area = width * height;
  const horizontalFovDeg =
    (2 * Math.atan(1 / (2 * T)) * 180) / Math.PI;
  const verticalFovDeg =
    (2 * Math.atan(1 / (2 * T * A)) * 180) / Math.PI;
  const pixelsPerMeterH = optics.resolution.width / width;
  const pixelsPerMeterV = optics.resolution.height / height;
  const mmPerPixelH = (1000 * width) / optics.resolution.width;
  return {
    width,
    height,
    diagonal,
    area,
    horizontalFovDeg,
    verticalFovDeg,
    pixelsPerMeterH,
    pixelsPerMeterV,
    mmPerPixelH,
  };
}
