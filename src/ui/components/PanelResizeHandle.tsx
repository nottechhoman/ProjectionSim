import { useRef } from 'react';
import styles from './PanelResizeHandle.module.css';

interface PanelResizeHandleProps {
  edge: 'left' | 'right';
  onResize: (deltaX: number) => void;
}

export function PanelResizeHandle({ edge, onResize }: PanelResizeHandleProps) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  return (
    <div
      className={`${styles.handle} ${edge === 'left' ? styles.onLeftPanel : styles.onRightPanel}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={edge === 'left' ? 'Resize scene panel' : 'Resize inspector panel'}
      onPointerDown={(event) => {
        event.preventDefault();
        dragging.current = true;
        lastX.current = event.clientX;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        const delta = event.clientX - lastX.current;
        lastX.current = event.clientX;
        onResize(edge === 'left' ? delta : -delta);
      }}
      onPointerUp={(event) => {
        dragging.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => {
        dragging.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    />
  );
}
