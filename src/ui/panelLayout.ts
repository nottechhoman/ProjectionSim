export const PANEL_WIDTH_MIN = 160;
export const PANEL_WIDTH_MAX = 560;
export const DEFAULT_LEFT_PANEL_WIDTH = 220;
export const DEFAULT_RIGHT_PANEL_WIDTH = 320;

export const PANEL_FLOAT_MARGIN = 8;
export const TOOLBAR_HEIGHT = 40;
export const FLOATING_PANEL_HEIGHT = 520;

export interface PanelFloatPosition {
  x: number;
  y: number;
}

export function clampPanelWidth(width: number): number {
  return Math.min(PANEL_WIDTH_MAX, Math.max(PANEL_WIDTH_MIN, Math.round(width)));
}

export function defaultLeftPanelFloat(width: number): PanelFloatPosition {
  return clampFloatPosition(
    PANEL_FLOAT_MARGIN,
    TOOLBAR_HEIGHT + PANEL_FLOAT_MARGIN,
    width,
    FLOATING_PANEL_HEIGHT,
  );
}

export function defaultRightPanelFloat(width: number): PanelFloatPosition {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  return clampFloatPosition(
    viewportWidth - width - PANEL_FLOAT_MARGIN,
    TOOLBAR_HEIGHT + PANEL_FLOAT_MARGIN,
    width,
    FLOATING_PANEL_HEIGHT,
  );
}

export function clampFloatPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): PanelFloatPosition {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  const minY = TOOLBAR_HEIGHT + PANEL_FLOAT_MARGIN;
  const maxX = Math.max(PANEL_FLOAT_MARGIN, viewportWidth - width - PANEL_FLOAT_MARGIN);
  const maxY = Math.max(minY, viewportHeight - height - PANEL_FLOAT_MARGIN);

  return {
    x: Math.min(maxX, Math.max(PANEL_FLOAT_MARGIN, Math.round(x))),
    y: Math.min(maxY, Math.max(minY, Math.round(y))),
  };
}
