import { useLocation, useNavigate } from "react-router-dom";
import { sidebarNavItems } from "@/features/navigation/data/navigation";
import { useTranslation } from "@/languages";
import { tapHaptic } from "@/shared/platform/haptics";

const TAB_PATHS: Record<string, string> = {
  home: "/",
  search: "/search",
  library: "/library",
  settings: "/settings",
};

function activeTabFor(pathname: string): string {
  if (pathname.startsWith("/search")) return "search";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/library")) return "library";
  return "home";
}

export default function MobileTabBar({ translucent = false }: { translucent?: boolean }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const active = activeTabFor(pathname);

  return (
    <nav
      className={`soniq-mobile-tabbar absolute inset-x-0 bottom-0 z-[40] flex items-stretch border-t backdrop-blur-xl in-data-[keyboard=open]:hidden ${
        // over a wallpaper / gradient background the bar is glass instead of the page colour
        translucent ? "border-white/10 bg-black/35" : "border-border-primary/40 bg-bg-primary/85"
      }`}
      style={{ height: "calc(var(--m-tab-h) + var(--safe-bottom))", paddingBottom: "var(--safe-bottom)" }}
      aria-label="Tab bar"
    >
      {sidebarNavItems.map(({ id, label, Icon }) => {
        const isActive = id === active;
        const path = TAB_PATHS[id] ?? "/";
        return (
          <button
            key={id}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => {
              tapHaptic();
              // tapping the active tab again returns to its root page
              if (pathname !== path) navigate(path);
            }}
            className={`soniq-mobile-tab relative flex flex-1 flex-col items-center justify-center gap-[3px] border-none bg-transparent cursor-pointer select-none transition-colors ${
              isActive ? "text-text-primary" : "text-text-tertiary"
            }`}
          >
            <Icon size={24} />
            <span className="text-[10.5px] font-[500] leading-none" style={{ fontFamily: "var(--font-inter), sans-serif" }}>
              {t(`common.sidebar.${id}`) || label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
