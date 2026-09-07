import { useAppStore } from '../store';
import styles from './App.module.css';
import { Viewport } from './Viewport';
import { Toolbar } from './panels/Toolbar';
import { LeftPanel } from './panels/LeftPanel';
import { Inspector } from './panels/Inspector';
import { BottomPanel } from './panels/BottomPanel';

export default function App() {
  const leftPanelVisible = useAppStore((s) => s.leftPanelVisible);
  const rightPanelVisible = useAppStore((s) => s.rightPanelVisible);
  const bottomPanelVisible = useAppStore((s) => s.bottomPanelVisible);
  const toggleLeftPanel = useAppStore((s) => s.toggleLeftPanel);
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel);
  const toggleBottomPanel = useAppStore((s) => s.toggleBottomPanel);

  const style = {
    gridTemplateColumns: `${leftPanelVisible ? '220px' : '0px'} 1fr ${rightPanelVisible ? '280px' : '0px'}`,
    gridTemplateRows: `40px 1fr ${bottomPanelVisible ? '28px' : '0px'}`,
  } as const;

  return (
    <div className={styles.app} style={style}>
      <div className={styles.toolbar}>
        <Toolbar />
      </div>
      <div className={`${styles.left} ${!leftPanelVisible ? styles.collapsed : ''}`}>
        {leftPanelVisible ? (
          <LeftPanel />
        ) : (
          <button type="button" className={styles.expandEdge} onClick={toggleLeftPanel} title="Show scene panel">
            Scene ›
          </button>
        )}
      </div>
      <div className={styles.center}>
        <Viewport />
      </div>
      <div className={`${styles.right} ${!rightPanelVisible ? styles.collapsed : ''}`}>
        {rightPanelVisible ? (
          <Inspector />
        ) : (
          <button type="button" className={styles.expandEdgeRight} onClick={toggleRightPanel} title="Show inspector">
            ‹ Inspector
          </button>
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
    </div>
  );
}
