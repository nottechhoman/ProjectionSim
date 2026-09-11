import { describe, expect, it } from 'vitest';
import {
  depthPassResolution,
  getDeviceProfile,
  responsivePanelWidths,
  targetPixelRatio,
} from './deviceProfile';

describe('deviceProfile', () => {
  it('classifies phone, tablet, and desktop widths', () => {
    expect(getDeviceProfile(390)).toBe('phone');
    expect(getDeviceProfile(820)).toBe('tablet');
    expect(getDeviceProfile(1280)).toBe('desktop');
  });

  it('scales render quality down on portable devices', () => {
    expect(depthPassResolution('phone')).toBe(256);
    expect(depthPassResolution('tablet')).toBe(384);
    expect(depthPassResolution('desktop')).toBe(512);
    expect(targetPixelRatio('phone')).toBeLessThanOrEqual(1.5);
  });

  it('uses narrower panel defaults on tablet', () => {
    expect(responsivePanelWidths('tablet')).toEqual({ left: 200, right: 260 });
  });
});
