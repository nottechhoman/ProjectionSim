import type { PaneView, ViewLayout, WorkspaceMode } from '../../types';

/** v9: viewport layouts, pane views and workspace modes (pure, testable). */

export const VIEW_LAYOUTS: { id: ViewLayout; label: string; title: string }[] = [
  { id: 'single', label: '1', title: 'One view' },
  { id: 'split', label: '1|1', title: 'Two views side by side' },
  { id: 'onePlusThree', label: '1+3', title: 'Large main view with three small views' },
  { id: 'quad', label: '2×2', title: 'Four equal views' },
];

export const WORKSPACE_MODES: { id: WorkspaceMode; label: string; title: string }[] = [
  { id: 'stage', label: 'Stage', title: 'Build the stage: scene and inspector, one big view' },
  { id: 'mapping', label: 'Mapping', title: 'Mappings and layers, with the selected projector output beside the stage' },
  { id: 'previz', label: 'Previz', title: 'Four views: perspective, top, front and through the projector' },
  { id: 'show', label: 'Show', title: 'Timeline and cues, panels hidden' },
  { id: 'output', label: 'Output', title: 'Stage plus every projector output' },
];

/** Number of extra panes (besides the main view) a layout shows. */
export function extraPaneCount(layout: ViewLayout): number {
  return layout === 'single' ? 0 : layout === 'split' ? 1 : 3;
}

/** CSS grid for the viewport container and each pane (index 0 = main). */
export function layoutGrid(layout: ViewLayout): { columns: string; rows: string; areas: string[] } {
  switch (layout) {
    case 'single':
      return { columns: '1fr', rows: '1fr', areas: ['1 / 1 / 2 / 2'] };
    case 'split':
      return { columns: '1fr 1fr', rows: '1fr', areas: ['1 / 1 / 2 / 2', '1 / 2 / 2 / 3'] };
    case 'quad':
      return {
        columns: '1fr 1fr',
        rows: '1fr 1fr',
        areas: ['1 / 1 / 2 / 2', '1 / 2 / 2 / 3', '2 / 1 / 3 / 2', '2 / 2 / 3 / 3'],
      };
    case 'onePlusThree':
      return {
        columns: '2fr 1fr',
        rows: '1fr 1fr 1fr',
        areas: ['1 / 1 / 4 / 2', '1 / 2 / 2 / 3', '2 / 2 / 3 / 3', '3 / 2 / 4 / 3'],
      };
  }
}

export function paneViewLabel(view: PaneView, projectorName: (id: string) => string | null): string {
  if (view === 'persp') return 'Perspective';
  if (view === 'top') return 'Top';
  if (view === 'front') return 'Front';
  if (view === 'side') return 'Side';
  const [kind, id] = splitPaneView(view);
  const name = projectorName(id) ?? 'Projector';
  return kind === 'projector' ? `Through ${name}` : `Output · ${name}`;
}

export function splitPaneView(view: PaneView): ['orbit' | 'projector' | 'output', string] {
  if (view.startsWith('projector:')) return ['projector', view.slice('projector:'.length)];
  if (view.startsWith('output:')) return ['output', view.slice('output:'.length)];
  return ['orbit', view];
}

/** A pane pointing at a deleted projector falls back to the first projector, or Top. */
export function resolvePaneView(view: PaneView, projectorIds: string[]): PaneView {
  const [kind, id] = splitPaneView(view);
  if (kind === 'orbit' || projectorIds.includes(id)) return view;
  return projectorIds[0] ? (`${kind}:${projectorIds[0]}` as PaneView) : 'top';
}

const DEFAULT_VIEWS: [PaneView, PaneView, PaneView] = ['top', 'front', 'side'];
const PREFS_KEY = 'projectionSim.multiview';
const LAYOUTS: ViewLayout[] = ['single', 'split', 'quad', 'onePlusThree'];

function isPaneView(v: unknown): v is PaneView {
  return (
    typeof v === 'string' &&
    (v === 'persp' || v === 'top' || v === 'front' || v === 'side' || v.startsWith('projector:') || v.startsWith('output:'))
  );
}

export function readMultiviewPrefs(): { layout: ViewLayout; views: [PaneView, PaneView, PaneView] } {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as { layout?: unknown; views?: unknown } | null;
    const layout = LAYOUTS.includes(raw?.layout as ViewLayout) ? (raw!.layout as ViewLayout) : 'single';
    const views = Array.isArray(raw?.views) && raw!.views.length === 3 && raw!.views.every(isPaneView)
      ? (raw!.views as [PaneView, PaneView, PaneView])
      : DEFAULT_VIEWS;
    return { layout, views: [...views] as [PaneView, PaneView, PaneView] };
  } catch {
    return { layout: 'single', views: [...DEFAULT_VIEWS] };
  }
}

export function writeMultiviewPrefs(layout: ViewLayout, views: [PaneView, PaneView, PaneView]): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ layout, views }));
  } catch {
    // Private mode or storage blocked: the layout just is not remembered.
  }
}

export interface WorkspacePanels {
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
  uvEditorPanelVisible: boolean;
  layersPanelVisible: boolean;
  timelineVisible: boolean;
  cuesPanelVisible: boolean;
  studioTab?: 'blend' | 'mappings' | 'warp' | 'outputs';
}

/** What a workspace mode does to the layout, pane views and panels. */
export function workspaceLayout(
  mode: WorkspaceMode,
  projectorIds: string[],
  selectedProjectorId: string,
  current: [PaneView, PaneView, PaneView],
): { layout: ViewLayout; views: [PaneView, PaneView, PaneView]; panels: WorkspacePanels } {
  const sel = selectedProjectorId || projectorIds[0] || '';
  const closed = { uvEditorPanelVisible: false, layersPanelVisible: false, cuesPanelVisible: false };
  switch (mode) {
    case 'stage':
      return {
        layout: 'single',
        views: current,
        panels: { leftPanelVisible: true, rightPanelVisible: true, timelineVisible: false, ...closed },
      };
    case 'mapping':
      return {
        layout: 'split',
        views: [sel ? `output:${sel}` : 'top', current[1], current[2]],
        panels: {
          leftPanelVisible: false,
          rightPanelVisible: true,
          timelineVisible: false,
          ...closed,
          uvEditorPanelVisible: true,
          studioTab: 'mappings',
        },
      };
    case 'previz':
      return {
        layout: 'quad',
        views: ['top', 'front', sel ? `projector:${sel}` : 'side'],
        panels: { leftPanelVisible: true, rightPanelVisible: true, timelineVisible: false, ...closed },
      };
    case 'show':
      return {
        layout: 'single',
        views: current,
        panels: { leftPanelVisible: false, rightPanelVisible: false, timelineVisible: true, ...closed, cuesPanelVisible: true },
      };
    case 'output': {
      const fill: PaneView[] = ['top', 'front', 'side'];
      const views = [0, 1, 2].map((i) => (projectorIds[i] ? (`output:${projectorIds[i]}` as PaneView) : fill[i]));
      return {
        layout: projectorIds.length > 1 ? 'quad' : 'split',
        views: views as [PaneView, PaneView, PaneView],
        panels: { leftPanelVisible: false, rightPanelVisible: true, timelineVisible: false, ...closed },
      };
    }
  }
}
