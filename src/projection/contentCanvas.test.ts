import { describe, expect, it } from 'vitest';
import type { ContentCanvasLayer } from '../types';
import {
  canvasPixelToSurfaceUv,
  clampContentCanvasSize,
  DEFAULT_CONTENT_CANVAS,
  fittedLayerRect,
  surfaceUvToCanvasPixel,
} from './contentCanvas';

function layer(patch: Partial<ContentCanvasLayer> = {}): ContentCanvasLayer {
  return {
    id: 'layer-1',
    name: 'Layer',
    kind: 'image',
    mediaAssetId: null,
    pattern: null,
    color: '#ffffff',
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    rotationDeg: 0,
    opacity: 1,
    fit: 'contain',
    visible: true,
    ...patch,
  };
}

describe('content canvas UV', () => {
  it('maps top-left canvas pixels to surface UV with a V flip', () => {
    expect(canvasPixelToSurfaceUv(0, 0, 3840, 1080)).toEqual({ u: 0, v: 1 });
    expect(canvasPixelToSurfaceUv(3840, 1080, 3840, 1080)).toEqual({ u: 1, v: 0 });
    expect(canvasPixelToSurfaceUv(1920, 540, 3840, 1080)).toEqual({ u: 0.5, v: 0.5 });
  });

  it('inverts the same V-flip from surface UV back to canvas pixels', () => {
    expect(surfaceUvToCanvasPixel(0, 1, 3840, 1080)).toEqual({ x: 0, y: 0 });
    expect(surfaceUvToCanvasPixel(1, 0, 3840, 1080)).toEqual({ x: 3840, y: 1080 });
    expect(surfaceUvToCanvasPixel(0.5, 0.5, 3840, 1080)).toEqual({ x: 1920, y: 540 });
  });
});

describe('layer fit within a canvas rect', () => {
  it('letterboxes a wider image with contain', () => {
    const rect = fittedLayerRect(layer({ width: 1920, height: 1080, fit: 'contain' }), 2);
    expect(rect.width).toBeCloseTo(1920);
    expect(rect.height).toBeCloseTo(960);
    expect(rect.x).toBe(0);
    expect(rect.y).toBeCloseTo(60);
  });

  it('crops a wider image with cover', () => {
    const rect = fittedLayerRect(layer({ width: 1920, height: 1080, fit: 'cover' }), 2);
    expect(rect.height).toBeCloseTo(1080);
    expect(rect.width).toBeCloseTo(2160);
    expect(rect.y).toBe(0);
    expect(rect.x).toBeCloseTo(-120);
  });

  it('fills the layer rect with stretch', () => {
    expect(fittedLayerRect(layer({ width: 100, height: 50, fit: 'stretch' }), 16 / 9)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    });
  });
});

describe('canvas size clamping', () => {
  it('keeps a 3840×1080 canvas on desktop when the GPU allows it', () => {
    const result = clampContentCanvasSize(3840, 1080, 'desktop', 16384);
    expect(result).toEqual({
      widthPx: 3840,
      heightPx: 1080,
      clamped: false,
      maxDimension: 4096,
    });
  });

  it('scales a canvas down to the phone cap', () => {
    const result = clampContentCanvasSize(3840, 1080, 'phone', 16384);
    expect(result.maxDimension).toBe(2048);
    expect(result.clamped).toBe(true);
    expect(result.widthPx).toBe(2048);
    expect(result.heightPx).toBe(Math.round(2048 * (1080 / 3840)));
  });

  it('uses maxTextureSize when it is smaller than the profile cap', () => {
    const result = clampContentCanvasSize(4096, 4096, 'desktop', 2048);
    expect(result.maxDimension).toBe(2048);
    expect(result.widthPx).toBe(2048);
    expect(result.heightPx).toBe(2048);
    expect(result.clamped).toBe(true);
  });

  it('defaults to a disabled empty canvas', () => {
    expect(DEFAULT_CONTENT_CANVAS.enabled).toBe(false);
    expect(DEFAULT_CONTENT_CANVAS.layers).toEqual([]);
    expect(DEFAULT_CONTENT_CANVAS.widthPx).toBe(3840);
    expect(DEFAULT_CONTENT_CANVAS.heightPx).toBe(1080);
  });
});
