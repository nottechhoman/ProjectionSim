import { describe, expect, it } from 'vitest';
import { extraPaneCount, layoutGrid, paneViewLabel, resolvePaneView, workspaceLayout } from './layouts';

describe('multiview layouts', () => {
  it('has one grid area per pane', () => {
    for (const layout of ['single', 'split', 'quad', 'onePlusThree'] as const) {
      expect(layoutGrid(layout).areas).toHaveLength(extraPaneCount(layout) + 1);
    }
  });

  it('falls back when a pane points at a deleted projector', () => {
    expect(resolvePaneView('projector:gone', ['a', 'b'])).toBe('projector:a');
    expect(resolvePaneView('output:gone', [])).toBe('top');
    expect(resolvePaneView('front', [])).toBe('front');
    expect(resolvePaneView('output:b', ['a', 'b'])).toBe('output:b');
  });

  it('labels panes with projector names', () => {
    const name = (id: string) => (id === 'p1' ? 'FOH left' : null);
    expect(paneViewLabel('projector:p1', name)).toBe('Through FOH left');
    expect(paneViewLabel('output:p1', name)).toBe('Output · FOH left');
    expect(paneViewLabel('top', name)).toBe('Top');
  });

  it('workspace modes arrange views and panels', () => {
    const current = ['top', 'front', 'side'] as const;
    const previz = workspaceLayout('previz', ['p1', 'p2'], 'p2', [...current]);
    expect(previz.layout).toBe('quad');
    expect(previz.views[2]).toBe('projector:p2');

    const output = workspaceLayout('output', ['p1', 'p2'], 'p1', [...current]);
    expect(output.views).toEqual(['output:p1', 'output:p2', 'side']);

    const show = workspaceLayout('show', ['p1'], 'p1', [...current]);
    expect(show.layout).toBe('single');
    expect(show.panels.timelineVisible).toBe(true);
    expect(show.panels.leftPanelVisible).toBe(false);

    const mapping = workspaceLayout('mapping', ['p1'], 'p1', [...current]);
    expect(mapping.panels.uvEditorPanelVisible).toBe(true);
    expect(mapping.views[0]).toBe('output:p1');
  });
});
