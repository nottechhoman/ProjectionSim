import styles from './App.module.css';
import { Viewport } from './Viewport';
import { Toolbar } from './panels/Toolbar';
import { LeftPanel } from './panels/LeftPanel';
import { Inspector } from './panels/Inspector';
import { BottomPanel } from './panels/BottomPanel';

export default function App() {
  return (
    <div className={styles.app}>
      <div className={styles.toolbar}>
        <Toolbar />
      </div>
      <div className={styles.left}>
        <LeftPanel />
      </div>
      <div className={styles.center}>
        <Viewport />
      </div>
      <div className={styles.right}>
        <Inspector />
      </div>
      <div className={styles.bottom}>
        <BottomPanel />
      </div>
    </div>
  );
}
