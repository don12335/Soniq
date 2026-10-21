import { Navigate, useNavigate, useParams } from "react-router-dom";
import { LeftLine, RightLine } from "@mingcute/react";
import {
  MOBILE_HIDDEN_TABS,
  SettingsTabContent,
  TAB_GROUPS,
  TAB_ICONS,
  useSettingsTabText,
  type TabId,
} from "@/features/settings";
import { useTranslation } from "@/languages";
import { tapHaptic } from "@/shared/platform/haptics";

const font = { fontFamily: "var(--font-inter), sans-serif" } as const;

const MOBILE_GROUPS = TAB_GROUPS.map((group) => ({
  ...group,
  ids: group.ids.filter((id) => !MOBILE_HIDDEN_TABS.has(id)),
})).filter((group) => group.ids.length > 0);

const MOBILE_TAB_IDS = new Set<string>(MOBILE_GROUPS.flatMap((group) => group.ids));

export function MobileSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tabLabels } = useSettingsTabText();

  return (
    <div className="h-full w-full overflow-y-auto px-[16px] pb-[24px] pt-[12px]">
      <h1 className="m-0 pb-[16px] text-[28px] font-[700] tracking-[-0.03em] text-text-primary" style={font}>
        {t("settings.title")}
      </h1>
      <div className="flex flex-col gap-[22px]">
        {MOBILE_GROUPS.map((group) => (
          <section key={group.labelKey}>
            <p className="m-0 px-[4px] pb-[8px] text-[13px] font-[500] uppercase tracking-[0.02em] text-text-tertiary" style={font}>
              {t(`settings.groups.${group.labelKey}`)}
            </p>
            <div className="soniq-mobile-surface overflow-hidden rounded-[14px] bg-bg-elevated">
              {group.ids.map((id, index) => {
                const Icon = TAB_ICONS[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      tapHaptic();
                      navigate(`/settings/${id.toLowerCase()}`);
                    }}
                    className={`flex min-h-[52px] w-full items-center gap-[14px] border-none bg-transparent px-[14px] text-left cursor-pointer active:bg-border-alpha-14 ${
                      index > 0 ? "border-t border-solid border-border-primary/40" : ""
                    }`}
                    style={font}
                  >
                    <Icon size={21} weight="Bold" className="shrink-0 text-text-secondary" />
                    <span className="flex-1 truncate text-[16px] text-text-primary">{tabLabels[id]}</span>
                    <RightLine size={18} className="shrink-0 text-text-tertiary" />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function MobileSettingsTabPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tab = "" } = useParams();
  const { tabLabels, tabDescriptions } = useSettingsTabText();

  const tabId = (tab.charAt(0).toUpperCase() + tab.slice(1)) as TabId;
  if (!MOBILE_TAB_IDS.has(tabId)) return <Navigate to="/settings" replace />;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-[48px] shrink-0 items-center px-[6px]">
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="inline-flex h-[44px] items-center gap-[2px] border-none bg-transparent pr-[10px] text-[16px] text-text-primary cursor-pointer"
          style={font}
        >
          <LeftLine size={22} />
          {t("settings.title")}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-[16px] pb-[24px]">
        <h1 className="m-0 text-[26px] font-[700] tracking-[-0.03em] text-text-primary" style={font}>
          {tabLabels[tabId]}
        </h1>
        <p className="m-0 mb-[16px] mt-[4px] text-[14px] leading-snug text-text-tertiary" style={font}>
          {tabDescriptions[tabId]}
        </p>
        <div className="soniq-mobile-settings-panel flex flex-col">
          <SettingsTabContent tabId={tabId} />
        </div>
      </div>
    </div>
  );
}
