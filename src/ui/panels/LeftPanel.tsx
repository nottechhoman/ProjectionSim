import { useAppStore } from '../../store';
import styles from './LeftPanel.module.css';

export function LeftPanel() {
  const sceneObjects = useAppStore((s) => s.sceneObjects);
  const projectors = useAppStore((s) => s.projectors);
  const selectedObjectId = useAppStore((s) => s.selectedObjectId);
  const setSelectedObject = useAppStore((s) => s.setSelectedObject);
  const setSelectedProjector = useAppStore((s) => s.setSelectedProjector);
  const toggleLeftPanel = useAppStore((s) => s.toggleLeftPanel);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>Scene</span>
        <button type="button" className={styles.collapseBtn} onClick={toggleLeftPanel} title="Hide scene panel">
          ×
        </button>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Objects</div>
        <ul className={styles.list}>
          {sceneObjects.map((obj) => (
            <li
              key={obj.id}
              className={`${styles.item} ${selectedObjectId === obj.id ? styles.selected : ''}`}
              onClick={() => setSelectedObject(obj.id)}
            >
              <span className={styles.name}>{obj.name}</span>
              <span className={styles.type}>{obj.type}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Projectors</div>
        <ul className={styles.list}>
          {projectors.map((proj) => (
            <li
              key={proj.id}
              className={`${styles.item} ${selectedObjectId === proj.id ? styles.selected : ''}`}
              onClick={() => setSelectedProjector(proj.id)}
            >
              <span className={styles.swatch} style={{ background: proj.color }} />
              <span className={styles.name}>{proj.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
