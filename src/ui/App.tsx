import { useAppStore } from '../store';
import styles from './App.module.css';
import { Viewport } from './Viewport';
import { Toolbar } from './panels/Toolbar';
import { LeftPanel } from './panels/LeftPanel';
import { Inspector } from './panels/Inspector';
import { BottomPanel } from './panels/BottomPanel';
import { PanelResizeHandle } from './components/PanelResizeHandle';
import { FloatingPanel } from './components/FloatingPanel';

export default function App() {
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
  const resizeLeftPanelBy = useAppStore((s) => s.resizeLeftPanelBy);
  const resizeRightPanelBy = useAppStore((s) => s.resizeRightPanelBy);
  const moveLeftPanelFloat = useAppStore((s) => s.moveLeftPanelFloat);
  const moveRightPanelFloat = useAppStore((s) => s.moveRightPanelFloat);

  const leftDocked = leftPanelVisible && !leftPanelPoppedOut;
  const rightDocked = rightPanelVisible && !rightPanelPoppedOut;

  const style = {
    gridTemplateColumns: `${leftDocked ? `${leftPanelWidth}px` : '0px'} 1fr ${rightDocked ? `${rightPanelWidth}px` : '0px'}`,
    gridTemplateRows: `40px 1fr ${bottomPanelVisible ? '28px' : '0px'}`,
  } as const;

  return (
    <div className={styles.app} style={style}>
      <div className={styles.toolbar}>
        <Toolbar />
      </div>
      <div className={`${styles.left} ${!leftDocked ? styles.collapsed : ''}`}>
        {leftDocked ? (
          <>
            <LeftPanel />
            <PanelResizeHandle edge="left" onResize={resizeLeftPanelBy} />
          </>
        ) : (
          !leftPanelVisible && (
            <button type="button" className={styles.expandEdge} onClick={toggleLeftPanel} title="Show scene panel">
              Scene ›
            </button>
          )
        )}
      </div>
      <div className={styles.center}>
        <Viewport />
      </div>
      <div className={`${styles.right} ${!rightDocked ? styles.collapsed : ''}`}>
        {rightDocked ? (
          <>
            <PanelResizeHandle edge="right" onResize={resizeRightPanelBy} />
            <Inspector />
          </>
        ) : (
          !rightPanelVisible && (
            <button type="button" className={styles.expandEdgeRight} onClick={toggleRightPanel} title="Show inspector">
              ‹ Inspector
            </button>
          )
        )}
      </div>
      <div className={`${styles.bottom} ${!bottomPanelVisible ? styles.collapsed : ''}`}>
        {bottomPanelVisible ? (
          <BottomPanel />
        ) : (
          <button type="button" className={styles.expandBottom} onClick={toggleBottomPanel} title="Show status bar">
            Status ▲
          </button>
        )}
      </div>

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
