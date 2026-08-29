"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Idle-reveal for map overlays: controls stay visible while you're interacting
 * with the map, then fade after `delayMs` of no interaction — and snap back the
 * instant you move/touch/click the map surface again. `hold` force-keeps them
 * visible during an active task (drawing, placing a marker, typing) so the UI
 * never vanishes mid-edit. Works for both mouse and touch (pointer events).
 *
 * Spread `bind` onto the map-wrap element and drive CSS off `data-idle`
 * (`!revealed`); when hidden the overlays get opacity:0 + pointer-events:none.
 */
export function useIdleReveal(hold: boolean, delayMs = 4500) {
  const [revealed, setRevealed] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdRef = useRef(hold);
  holdRef.current = hold;

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const arm = useCallback(() => {
    clear();
    if (holdRef.current) return;            // active task → don't schedule a hide
    timer.current = setTimeout(() => setRevealed(false), delayMs);
  }, [delayMs]);

  const wake = useCallback(() => { setRevealed(true); arm(); }, [arm]);

  // hold rising → force visible + cancel any pending hide; hold falling → re-arm.
  useEffect(() => { if (hold) { clear(); setRevealed(true); } else { arm(); } }, [hold, arm]);
  useEffect(() => () => clear(), []);

  const bind = {
    onPointerMove: wake,
    onPointerDown: wake,
    onTouchStart: wake,
    onWheel: wake,
  };

  return { revealed, wake, bind };
}
