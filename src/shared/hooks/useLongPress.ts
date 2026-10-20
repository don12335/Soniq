import { useCallback, useEffect, useRef } from "react";

const DEFAULT_DELAY_MS = 450;
// finger movement beyond this cancels the press (the user is scrolling)
const MOVE_TOLERANCE_PX = 10;

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onClickCapture: (e: React.MouseEvent) => void;
}

// Touch long-press, since iOS never fires contextmenu. The click that follows a
// completed long press is swallowed so the row doesn't also play.
export function useLongPress(onLongPress: (point: { x: number; y: number }) => void, delayMs = DEFAULT_DELAY_MS): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const callbackRef = useRef(onLongPress);
  callbackRef.current = onLongPress;

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return;
      firedRef.current = false;
      clear();
      const point = { x: e.clientX, y: e.clientY };
      startRef.current = point;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        firedRef.current = true;
        navigator.vibrate?.(10);
        callbackRef.current(point);
      }, delayMs);
    },
    [clear, delayMs],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE_PX) clear();
    },
    [clear],
  );

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!firedRef.current) return;
    firedRef.current = false;
    e.stopPropagation();
    e.preventDefault();
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp: clear, onPointerCancel: clear, onClickCapture };
}
