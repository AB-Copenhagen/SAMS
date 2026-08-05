'use client';

import { useRef } from 'react';

const SWIPE_THRESHOLD_PX = 50;

/**
 * Plain touchstart/touchend delta detection — no gesture library. Requires the horizontal
 * movement to dominate the vertical so a scroll gesture on a taller-than-viewport page never gets
 * mistaken for a swipe.
 */
export function useSwipe({ onSwipeLeft, onSwipeRight }: { onSwipeLeft: () => void; onSwipeRight: () => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    const origin = start.current;
    start.current = null;
    if (!origin) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - origin.x;
    const dy = t.clientY - origin.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return;

    if (dx < 0) onSwipeLeft(); else onSwipeRight();
  }

  return { onTouchStart, onTouchEnd };
}
