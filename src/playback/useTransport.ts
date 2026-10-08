import { useEffect, useState, useSyncExternalStore } from 'react';
import { transport } from './clock';

/** Re-render on transport changes (play / pause / seek / rate). */
export function useTransportState(): { playing: boolean; rate: number } {
  const snap = useSyncExternalStore(
    (fn) => transport.subscribe(fn),
    () => `${transport.playing}|${transport.rate}`,
  );
  const [playing, rate] = snap.split('|');
  return { playing: playing === 'true', rate: Number(rate) };
}

/** Playhead (seconds), refreshed every animation frame while playing. */
export function usePlayhead(): number {
  const [t, setT] = useState(() => transport.time());
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setT(transport.time());
      if (transport.playing) raf = requestAnimationFrame(tick);
    };
    const unsub = transport.subscribe(() => {
      cancelAnimationFrame(raf);
      tick();
    });
    tick();
    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, []);
  return t;
}
