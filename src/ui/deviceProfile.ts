import {
  DEFAULT_LEFT_PANEL_WIDTH,
  DEFAULT_RIGHT_PANEL_WIDTH,
} from './panelLayout';

export type DeviceProfile = 'phone' | 'tablet' | 'desktop';

/** iPhone-class widths in portrait and small landscape */
export const PHONE_MAX_WIDTH = 767;
/** iPad-class widths through iPad Pro landscape */
export const TABLET_MAX_WIDTH = 1100;

export function getDeviceProfile(
  width = typeof window !== 'undefined' ? window.innerWidth : 1280,
): DeviceProfile {
  if (width <= PHONE_MAX_WIDTH) return 'phone';
  if (width <= TABLET_MAX_WIDTH) return 'tablet';
  return 'desktop';
}

export function isCompactLayout(profile: DeviceProfile = getDeviceProfile()): boolean {
  return profile !== 'desktop';
}

export function targetPixelRatio(profile: DeviceProfile = getDeviceProfile()): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  if (profile === 'phone') return Math.min(dpr, 1.5);
  if (profile === 'tablet') return Math.min(dpr, 1.75);
  return Math.min(dpr, 2);
}

export function depthPassResolution(profile: DeviceProfile = getDeviceProfile()): number {
  if (profile === 'phone') return 256;
  if (profile === 'tablet') return 384;
  return 512;
}

/** Long-edge cap for per-projector output raster preview targets. */
export function rasterPreviewResolution(profile: DeviceProfile = getDeviceProfile()): number {
  if (profile === 'phone') return 256;
  if (profile === 'tablet') return 320;
  return 384;
}

export function responsivePanelWidths(
  profile: DeviceProfile,
  viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 390,
): {
  left: number;
  right: number;
} {
  if (profile === 'phone') {
    return { left: 280, right: Math.min(320, Math.round(viewportWidth * 0.88)) };
  }
  if (profile === 'tablet') {
    return { left: 200, right: 260 };
  }
  return { left: DEFAULT_LEFT_PANEL_WIDTH, right: DEFAULT_RIGHT_PANEL_WIDTH };
}

export function shouldStartWithPanelsHidden(profile: DeviceProfile): boolean {
  return profile === 'phone';
}
