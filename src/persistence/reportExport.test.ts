import { describe, it, expect } from 'vitest';
import { DEFAULT_PROJECTORS } from '../store/defaultScene';
import { buildCalculationCsv, buildCalculationHtml } from './reportExport';
import type { CalculationResults } from '../types';

const calculationResults: CalculationResults = {
  nominal: {
    width: 4,
    height: 2.25,
    area: 9,
    diagonal: 4.583,
    horizontalFovDeg: 37.5,
    verticalFovDeg: 21.8,
    pixelsPerMeterH: 480,
    pixelsPerMeterV: 480,
    mmPerPixelH: 2.083,
  },
  footprint: {
    corners: [],
    unclippedArea: 9,
    clippedArea: 9,
    centerHit: null,
    axialDistance: 6,
  },
  opticsError: null,
  overlap: null,
  coverageAnalysis: null,
  calculationTarget: { id: 'screen-1', name: 'Screen', type: 'screen' },
};

describe('reportExport', () => {
  it('builds CSV with projection fields', () => {
    const csv = buildCalculationCsv({
      projectName: 'Test Scene',
      displayUnit: 'm',
      projectors: DEFAULT_PROJECTORS,
      calculationResults,
    });
    expect(csv).toContain('ProjectionLab Calculation Report');
    expect(csv).toContain('Width,4.000 m');
    expect(csv).toContain('Calculation target,Screen (screen)');
  });

  it('builds printable HTML report', () => {
    const html = buildCalculationHtml({
      projectName: 'Test Scene',
      displayUnit: 'm',
      projectors: DEFAULT_PROJECTORS,
      calculationResults,
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('ProjectionLab Report');
    expect(html).toContain('Calculation target');
    expect(html).toContain('Screen (screen)');
  });
});
