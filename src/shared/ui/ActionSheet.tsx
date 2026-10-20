import BottomSheet from "./BottomSheet";
import type { DropdownMenuItem } from "./DropdownMenu";

export interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  items: DropdownMenuItem[];
  title?: React.ReactNode;
  theme?: "dark";
}

// Phone replacement for DropdownMenu: the same items as large rows in a bottom sheet.
export default function ActionSheet({ open, onClose, items, title, theme }: ActionSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title} theme={theme}>
      <div className="flex flex-col px-[8px] pb-[10px]" data-dropdown-menu="true">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={async (e) => {
              e.stopPropagation();
              onClose();
              await item.onClick();
            }}
            className={`flex w-full min-h-[50px] items-center gap-[14px] rounded-[12px] px-[14px] text-[16px] font-[450] border-none bg-transparent text-left cursor-pointer select-none outline-none active:bg-border-alpha-14 disabled:pointer-events-none disabled:opacity-40 ${
              item.danger ? "text-red-400" : "text-text-primary"
            }`}
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            {item.icon && (
              <span
                className={`shrink-0 flex w-[22px] items-center justify-center text-[19px] ${
                  item.danger ? "text-red-400" : "text-text-secondary"
                }`}
              >
                {item.icon}
              </span>
            )}
            <span className="truncate flex-1">{item.label}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
