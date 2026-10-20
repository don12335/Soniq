import { useEffect } from "react";

// WebKit can dispatch a click after a short finger swipe on a scrolling card.
// Block only the click from that gesture; a fresh tap starts a fresh gesture.
export function useTouchScrollClickGuard(): void {
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let moved = false;
    let active = false;
    let endedAt = 0;

    const onTouchStart = (event: TouchEvent) => {
      moved = event.touches.length !== 1;
      active = event.touches.length === 1;
      const touch = event.touches[0];
      if (touch) {
        startX = touch.clientX;
        startY = touch.clientY;
      }
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!active || moved) return;
      const touch = event.touches[0];
      if (touch && Math.hypot(touch.clientX - startX, touch.clientY - startY) > 8) {
        moved = true;
      }
    };
    const onTouchEnd = () => {
      active = false;
      endedAt = Date.now();
    };
    const onTouchCancel = () => {
      moved = true;
      onTouchEnd();
    };
    const onClick = (event: MouseEvent) => {
      if (!moved || Date.now() - endedAt > 750) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      moved = false;
    };

    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
    document.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { capture: true, passive: true });
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchCancel, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
}
