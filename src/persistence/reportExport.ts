import type { CalculationResults, DisplayUnit, ProjectorConfig } from '../types';
import { formatLength } from '../utils/units';

export interface ReportContext {
  projectName: string;
  displayUnit: DisplayUnit;
  projectors: ProjectorConfig[];
  calculationResults: CalculationResults;
  exportedAt?: string;
}

function projectorName(projectors: ProjectorConfig[], id: string): string {
  return projectors.find((p) => p.id === id)?.name ?? id;
}

function escapeCsv(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function buildCalculationCsv(ctx: ReportContext): string {
  const { nominal, footprint, overlap } = ctx.calculationResults;
  const rows: string[][] = [
    ['ProjectionLab Calculation Report'],
    ['Project', ctx.projectName],
    ['Exported', ctx.exportedAt ?? new Date().toISOString()],
    ['Display unit', ctx.displayUnit],
    [],
    ['Section', 'Field', 'Value'],
  ];

  if (nominal) {
    rows.push(
      ['Projection', 'Width', formatLength(nominal.width, ctx.displayUnit)],
      ['Projection', 'Height', formatLength(nominal.height, ctx.displayUnit)],
      ['Projection', 'Area (m²)', nominal.area.toFixed(4)],
      ['Projection', 'Pixels per meter (H)', nominal.pixelsPerMeterH.toFixed(2)],
      ['Projection', 'mm per pixel (H)', nominal.mmPerPixelH.toFixed(4)],
    );
  }

  if (footprint) {
    rows.push(
      ['Footprint', 'Clipped area (m²)', footprint.clippedArea.toFixed(4)],
      [
        'Footprint',
        'Axial distance',
        footprint.axialDistance != null ? formatLength(footprint.axialDistance, ctx.displayUnit) : '',
      ],
    );
  }

  if (overlap) {
    rows.push(
      ['Overlap', 'Union area (m²)', overlap.unionAreaM2.toFixed(4)],
      ['Overlap', 'Multi-coverage area (m²)', overlap.multiCoverageAreaM2.toFixed(4)],
      [
        'Overlap',
        'Horizontal overlap',
        overlap.horizontalOverlapM != null ? formatLength(overlap.horizontalOverlapM, ctx.displayUnit) : '',
      ],
      [
        'Overlap',
        'Combined width',
        overlap.combinedWidthM != null ? formatLength(overlap.combinedWidthM, ctx.displayUnit) : '',
      ],
    );
    for (const pair of overlap.pairwise) {
      rows.push(
        [
          'Pairwise overlap',
          `${projectorName(ctx.projectors, pair.projectorAId)} ∩ ${projectorName(ctx.projectors, pair.projectorBId)} area (m²)`,
          pair.areaM2.toFixed(4),
        ],
        [
          'Pairwise overlap',
          'Overlap width',
          pair.overlapWidthM != null ? formatLength(pair.overlapWidthM, ctx.displayUnit) : '',
        ],
        [
          'Pairwise overlap',
          'Percent of A / B',
          pair.overlapWidthM != null ? `${pair.percentOfA.toFixed(1)}% / ${pair.percentOfB.toFixed(1)}%` : '',
        ],
        [
          'Pairwise overlap',
          'Overlap pixels A / B',
          pair.overlapPixelsA != null ? `${pair.overlapPixelsA} / ${pair.overlapPixelsB}` : '',
        ],
      );
    }
  }

  return rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildCalculationHtml(ctx: ReportContext): string {
  const { nominal, footprint, overlap } = ctx.calculationResults;
  const exportedAt = ctx.exportedAt ?? new Date().toISOString();

  const row = (label: string, value: string) =>
    `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;

  let body = `<h1>ProjectionLab Report</h1>
<p><strong>Project:</strong> ${escapeHtml(ctx.projectName)}<br/>
<strong>Exported:</strong> ${escapeHtml(exportedAt)}<br/>
<strong>Display unit:</strong> ${escapeHtml(ctx.displayUnit)}</p>`;

  if (nominal) {
    body += `<h2>Projection</h2><table>
${row('Width', formatLength(nominal.width, ctx.displayUnit))}
${row('Height', formatLength(nominal.height, ctx.displayUnit))}
${row('Area', `${nominal.area.toFixed(2)} m²`)}
${row('Density', `${nominal.pixelsPerMeterH.toFixed(1)} px/m · ${nominal.mmPerPixelH.toFixed(3)} mm/px`)}
</table>`;
  }

  if (footprint) {
    body += `<h2>Footprint</h2><table>
${row('Clipped area', `${footprint.clippedArea.toFixed(2)} m²`)}
${footprint.axialDistance != null ? row('Axial distance', formatLength(footprint.axialDistance, ctx.displayUnit)) : ''}
</table>`;
  }

  if (overlap) {
    body += `<h2>Overlap</h2><table>
${row('Union area', `${overlap.unionAreaM2.toFixed(2)} m²`)}
${row('Multi-coverage', `${overlap.multiCoverageAreaM2.toFixed(2)} m²`)}
${overlap.horizontalOverlapM != null ? row('Horizontal overlap', formatLength(overlap.horizontalOverlapM, ctx.displayUnit)) : ''}
${overlap.combinedWidthM != null ? row('Combined width', formatLength(overlap.combinedWidthM, ctx.displayUnit)) : ''}
</table>`;

    if (overlap.pairwise.length > 0) {
      body += '<h3>Pairwise</h3><table><thead><tr><th>Pair</th><th>Area</th><th>Width</th><th>Pixels</th></tr></thead><tbody>';
      for (const pair of overlap.pairwise) {
        const name = `${projectorName(ctx.projectors, pair.projectorAId)} ∩ ${projectorName(ctx.projectors, pair.projectorBId)}`;
        body += `<tr>
<td>${escapeHtml(name)}</td>
<td>${escapeHtml(pair.areaM2.toFixed(2))} m²</td>
<td>${escapeHtml(pair.overlapWidthM != null ? formatLength(pair.overlapWidthM, ctx.displayUnit) : '—')}</td>
<td>${escapeHtml(pair.overlapPixelsA != null ? `${pair.overlapPixelsA} / ${pair.overlapPixelsB}` : '—')}</td>
</tr>`;
      }
      body += '</tbody></table>';
    }
  }

  if (!nominal) {
    body += '<p>No calculation results available for the current selection.</p>';
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(ctx.projectName)} — ProjectionLab Report</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 32px; color: #222; }
    h1, h2, h3 { margin-top: 1.5em; }
    table { border-collapse: collapse; width: 100%; max-width: 720px; margin-bottom: 1em; }
    th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; }
    th { background: #f5f5f5; width: 40%; }
    p { line-height: 1.5; }
  </style>
</head>
<body>${body}
<p><em>Planning and visualization tool — not calibrated photometric output.</em></p>
</body>
</html>`;
}

export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
