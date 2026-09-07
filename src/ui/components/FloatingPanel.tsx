import { useRef, type ReactNode } from 'react';
import {
  clampFloatPosition,
  FLOATING_PANEL_HEIGHT,
} from '../panelLayout';
import { PanelResizeHandle } from './PanelResizeHandle';
import styles from './FloatingPanel.module.css';

interface FloatingPanelProps {
  x: number;
  y: number;
  width: number;
  edge: 'left' | 'right';
  onMove: (x: number, y: number) => void;
  onResize: (delta: number) => void;
  children: ReactNode;
}

export function FloatingPanel({ x, y, width, edge, onMove, onResize, children }: FloatingPanelProps) {
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  return (
    <div
      className={styles.floating}
      style={{ left: x, top: y, width, height: FLOATING_PANEL_HEIGHT }}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-panel-header]') || target.closest('button')) return;
        dragging.current = true;
        dragOffset.current = { x: event.clientX - x, y: event.clientY - y };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        const next = clampFloatPosition(
          event.clientX - dragOffset.current.x,
          event.clientY - dragOffset.current.y,
          width,
          FLOATING_PANEL_HEIGHT,
        );
        onMove(next.x, next.y);
      }}
      onPointerUp={(event) => {
        dragging.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => {
        dragging.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      {children}
      <PanelResizeHandle edge={edge} onResize={onResize} />
    </div>
  );
}
