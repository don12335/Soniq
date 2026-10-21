import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls, type PanInfo } from "framer-motion";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: React.ReactNode;
  // fixed height (e.g. "85dvh") for sheets that scroll their own content; otherwise sized to content
  height?: string;
  className?: string;
  // the sheet is portaled to <body>, so sheets opened from a dark screen pass "dark" to stay dark
  theme?: "dark";
}

const DISMISS_OFFSET = 110;
const DISMISS_VELOCITY = 600;

// Phone sheet that slides up from the bottom. Dragging the grabber/header down dismisses it;
// the body scrolls normally.
export default function BottomSheet({ open, onClose, children, title, height, className = "", theme }: BottomSheetProps) {
  const dragControls = useDragControls();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) onClose();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className={`fixed inset-0 z-[9000] ${theme === "dark" ? "dark" : ""}`}
          data-theme={theme}
          data-dialog-container
          // portal events still bubble through the React tree: keep taps (e.g. on the backdrop)
          // from reaching the row that opened the sheet, which would play it
          onClick={(e) => e.stopPropagation()}
        >
          <motion.div
            key="sheet-backdrop"
            data-dialog-backdrop
            className="absolute inset-0 bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            className={`soniq-mobile-sheet absolute inset-x-0 bottom-0 flex flex-col rounded-t-[20px] bg-bg-elevated text-text-primary max-h-[92dvh] ${className}`}
            style={{ height, paddingBottom: "max(var(--safe-bottom), var(--keyboard-h, 0px))" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={handleDragEnd}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              data-drag-handle
              className="shrink-0 pt-[8px] pb-[6px] cursor-grab"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="mx-auto h-[5px] w-[38px] rounded-full bg-text-tertiary/50" />
              {title && (
                <div
                  className="px-[20px] pt-[10px] pb-[4px] text-[16px] font-[600] tracking-[-0.01em]"
                  style={{ fontFamily: "var(--font-inter), sans-serif" }}
                >
                  {title}
                </div>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
