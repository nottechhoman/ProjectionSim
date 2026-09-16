import { useEffect } from 'react';
import { useAppStore } from '../store';
import styles from './App.module.css';
import { Viewport } from './Viewport';
import { Toolbar } from './panels/Toolbar';
import { LeftPanel } from './panels/LeftPanel';
import { Inspector } from './panels/Inspector';
import { BottomPanel } from './panels/BottomPanel';
import { ContentCanvasPanel } from './panels/ContentCanvasPanel';
import { RasterPreviewPanel } from './panels/RasterPreviewPanel';
import { PanelResizeHandle } from './components/PanelResizeHandle';
import { FloatingPanel } from './components/FloatingPanel';
import { isCompactLayout } from './deviceProfile';
import { useDeviceProfile } from './useDeviceProfile';

export default function App() {
  const deviceProfile = useDeviceProfile();
  const compact = isCompactLayout(deviceProfile);
  const leftPanelVisible = useAppStore((s) => s.leftPanelVisible);
  const rightPanelVisible = useAppStore((s) => s.rightPanelVisible);
  const bottomPanelVisible = useAppStore((s) => s.bottomPanelVisible);
  const leftPanelPoppedOut = useAppStore((s) => s.leftPanelPoppedOut);
  const rightPanelPoppedOut = useAppStore((s) => s.rightPanelPoppedOut);
  const leftPanelWidth = useAppStore((s) => s.leftPanelWidth);
  const rightPanelWidth = useAppStore((s) => s.rightPanelWidth);
  const leftPanelFloat = useAppStore((s) => s.leftPanelFloat);
  const rightPanelFloat = useAppStore((s) => s.rightPanelFloat);
  const toggleLeftPanel = useAppStore((s) => s.toggleLeftPanel);
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel);
  const toggleBottomPanel = useAppStore((s) => s.toggleBottomPanel);
  const contentCanvasPanelVisible = useAppStore((s) => s.contentCanvasPanelVisible);
  const setContentCanvasPanelVisible = useAppStore((s) => s.setContentCanvasPanelVisible);
  const rasterPreviewPanelVisible = useAppStore((s) => s.rasterPreviewPanelVisible);
  const setRasterPreviewPanelVisible = useAppStore((s) => s.setRasterPreviewPanelVisible);
  const setLeftPanelVisible = useAppStore((s) => s.setLeftPanelVisible);
  const setRightPanelVisible = useAppStore((s) => s.setRightPanelVisible);
  const resizeLeftPanelBy = useAppStore((s) => s.resizeLeftPanelBy);
  const resizeRightPanelBy = useAppStore((s) => s.resizeRightPanelBy);
  const moveLeftPanelFloat = useAppStore((s) => s.moveLeftPanelFloat);
  const moveRightPanelFloat = useAppStore((s) => s.moveRightPanelFloat);
  const selectedProjectorId = useAppStore((s) => s.selectedProjectorId);
  const projectors = useAppStore((s) => s.projectors);
  const selectedProjector =
    projectors.find((p) => p.id === selectedProjectorId) ?? projectors[0];
  const hasVideoTimeline =
    selectedProjector?.mediaSource === 'video' && !!selectedProjector.mediaAssetId;

  const leftDocked = leftPanelVisible && !leftPanelPoppedOut && !compact;
  const rightDocked = rightPanelVisible && !rightPanelPoppedOut && !compact;
  const leftDrawer = compact && leftPanelVisible && !leftPanelPoppedOut;
  const rightDrawer = compact && rightPanelVisible && !rightPanelPoppedOut;

  useEffect(() => {
    if (!compact) return;
    document.body.dataset.compactLayout = deviceProfile;
    return () => {
      delete document.body.dataset.compactLayout;
    };
  }, [compact, deviceProfile]);

  const closeDrawers = () => {
    setLeftPanelVisible(false);
    setRightPanelVisible(false);
    setContentCanvasPanelVisible(false);
    setRasterPreviewPanelVisible(false);
  };

  const style = compact
    ? ({
        gridTemplateColumns: '1fr',
        gridTemplateRows: `auto 1fr auto ${bottomPanelVisible ? (hasVideoTimeline ? '56px' : '28px') : '0px'}`,
      } as const)
    : ({
        gridTemplateColumns: `${leftDocked ? `${leftPanelWidth}px` : '0px'} 1fr ${rightDocked ? `${rightPanelWidth}px` : '0px'}`,
        gridTemplateRows: `40px 1fr ${bottomPanelVisible ? (hasVideoTimeline ? '56px' : '28px') : '0px'}`,
      } as const);

  return (
    <div
      className={`${styles.app} ${compact ? styles.compact : ''}`}
      style={style}
      data-device={deviceProfile}
    >
      <div className={styles.toolbar}>
        <Toolbar compact={compact} />
      </div>
      <div className={`${styles.left} ${!leftDocked ? styles.collapsed : ''}`}>
        {leftDocked ? (
          <>
            <LeftPanel />
            <PanelResizeHandle edge="left" onResize={resizeLeftPanelBy} />
          </>
        ) : (
          !leftPanelVisible &&
          !compact && (
            <button type="button" className={styles.expandEdge} onClick={toggleLeftPanel} title="Show scene panel">
              Scene ›
            </button>
          )
        )}
      </div>
      <div className={styles.center}>
        <Viewport />
        {!compact ? <ContentCanvasPanel /> : null}
        {!compact ? <RasterPreviewPanel /> : null}
      </div>
      <div className={`${styles.right} ${!rightDocked ? styles.collapsed : ''}`}>
        {rightDocked ? (
          <>
            <PanelResizeHandle edge="right" onResize={resizeRightPanelBy} />
            <Inspector />
          </>
        ) : (
          !rightPanelVisible &&
          !compact && (
            <button type="button" className={styles.expandEdgeRight} onClick={toggleRightPanel} title="Show inspector">
              ‹ Inspector
            </button>
          )
        )}
      </div>

      {compact ? (
        <div className={styles.mobileNav}>
          <button
            type="button"
            className={leftPanelVisible ? styles.mobileNavActive : undefined}
            onClick={() => {
              setRightPanelVisible(false);
              setContentCanvasPanelVisible(false);
              setRasterPreviewPanelVisible(false);
              toggleLeftPanel();
            }}
          >
            Scene
          </button>
          <button
            type="button"
            className={
              !leftPanelVisible &&
              !rightPanelVisible &&
              !contentCanvasPanelVisible &&
              !rasterPreviewPanelVisible
                ? styles.mobileNavActive
                : undefined
            }
            onClick={closeDrawers}
          >
            Viewport
          </button>
          <button
            type="button"
            className={contentCanvasPanelVisible ? styles.mobileNavActive : undefined}
            onClick={() => {
              setLeftPanelVisible(false);
              setRightPanelVisible(false);
              setRasterPreviewPanelVisible(false);
              setContentCanvasPanelVisible(true);
            }}
          >
            Canvas
          </button>
          <button
            type="button"
            className={rasterPreviewPanelVisible ? styles.mobileNavActive : undefined}
            onClick={() => {
              setLeftPanelVisible(false);
              setRightPanelVisible(false);
              setContentCanvasPanelVisible(false);
              setRasterPreviewPanelVisible(true);
            }}
          >
            Output
          </button>
          <button
            type="button"
            className={rightPanelVisible ? styles.mobileNavActive : undefined}
            onClick={() => {
              setLeftPanelVisible(false);
              setContentCanvasPanelVisible(false);
              setRasterPreviewPanelVisible(false);
              toggleRightPanel();
            }}
          >
            Inspector
          </button>
        </div>
      ) : null}

      <div className={`${styles.bottom} ${!bottomPanelVisible ? styles.collapsed : ''}`}>
        {bottomPanelVisible ? (
          <BottomPanel />
        ) : (
          <button type="button" className={styles.expandBottom} onClick={toggleBottomPanel} title="Show status bar">
            Status ▲
          </button>
        )}
      </div>

      {compact && contentCanvasPanelVisible ? <ContentCanvasPanel /> : null}
      {compact && rasterPreviewPanelVisible ? <RasterPreviewPanel /> : null}

      {leftDrawer ? (
        <>
          <button type="button" className={styles.drawerBackdrop} onClick={toggleLeftPanel} aria-label="Close scene panel" />
          <div className={styles.drawerLeft} style={{ width: leftPanelWidth }}>
            <LeftPanel />
          </div>
        </>
      ) : null}

      {rightDrawer ? (
        <>
          <button type="button" className={styles.drawerBackdrop} onClick={toggleRightPanel} aria-label="Close inspector" />
          <div className={styles.drawerRight} style={{ width: rightPanelWidth }}>
            <Inspector />
          </div>
        </>
      ) : null}

      {leftPanelVisible && leftPanelPoppedOut ? (
        <FloatingPanel
          x={leftPanelFloat.x}
          y={leftPanelFloat.y}
          width={leftPanelWidth}
          edge="left"
          onMove={moveLeftPanelFloat}
          onResize={resizeLeftPanelBy}
        >
          <LeftPanel />
        </FloatingPanel>
      ) : null}

      {rightPanelVisible && rightPanelPoppedOut ? (
        <FloatingPanel
          x={rightPanelFloat.x}
          y={rightPanelFloat.y}
          width={rightPanelWidth}
          edge="right"
          onMove={moveRightPanelFloat}
          onResize={resizeRightPanelBy}
        >
          <Inspector />
        </FloatingPanel>
      ) : null}
    </div>
  );
}
