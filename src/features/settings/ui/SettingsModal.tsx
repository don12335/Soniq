import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { CloseLine, Search2Line, CloseCircleFill } from "@mingcute/react";
import Dialog from "@/shared/ui/Dialog";
import { useTranslation, getTranslationsForAllLocales } from "@/languages";
import { useModalStore } from "@/features/library";
import { SettingsTabContent, useSettingsTabText } from "./SettingsTabContent";
import { SETTING_ITEMS, TAB_GROUPS, TAB_ICONS, type TabId } from "../data/settingsTabs";

const font = { fontFamily: "var(--font-inter), sans-serif" } as const;

export default function SettingsModal() {
  const { t } = useTranslation();
  const open = useModalStore((state) => state.settingsOpen);
  const close = useModalStore((state) => state.closeSettings);

  const [activeTab, setActiveTab] = useState<TabId>("Playback");
  const [searchQuery, setSearchQuery] = useState("");

  const handleClose = () => {
    setSearchQuery("");
    close();
  };

  const { tabLabels, tabDescriptions } = useSettingsTabText();

  const matchingTabIds = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const query = searchQuery.toLowerCase().trim();
    const set = new Set<TabId>();

    const TAB_LABEL_KEYS: Record<TabId, string> = {
      Playback: "settings.tabs.playback",
      Shortcuts: "settings.tabs.shortcuts",
      Overlay: "settings.tabs.overlay",
      Discord: "settings.tabs.discord",
      Appearance: "settings.theme.title",
      Customization: "settings.tabs.customization",
      Audio: "settings.tabs.audio",
      Storage: "settings.tabs.storage",
      About: "settings.tabs.about",
    };

    const TAB_DESC_KEYS: Record<TabId, string> = {
      Playback: "settings.playback.description",
      Shortcuts: "settings.shortcuts.description",
      Overlay: "settings.overlay.description",
      Discord: "settings.discord.description",
      Appearance: "settings.theme.description",
      Customization: "settings.customization.description",
      Audio: "settings.audio.description",
      Storage: "settings.storage.description",
      About: "settings.about.tagline",
    };


    (Object.keys(TAB_LABEL_KEYS) as TabId[]).forEach((tabId) => {
      const texts = [
        ...getTranslationsForAllLocales(TAB_LABEL_KEYS[tabId]),
        ...getTranslationsForAllLocales(TAB_DESC_KEYS[tabId]),
      ];
      if (texts.some((txt) => txt.toLowerCase().includes(query))) {
        set.add(tabId);
      }
    });

    SETTING_ITEMS.forEach((item) => {
      const texts = [
        ...getTranslationsForAllLocales(item.titleKey),
        ...(item.descKey ? getTranslationsForAllLocales(item.descKey) : []),
      ];
      if (texts.some((txt) => txt.toLowerCase().includes(query))) {
        set.add(item.tabId);
      }
    });

    return set;
  }, [searchQuery]);

  const filteredGroups = useMemo(() => {
    if (!matchingTabIds) return TAB_GROUPS;

    return TAB_GROUPS.map((group) => {
      const ids = group.ids.filter((id) => matchingTabIds.has(id));
      return { ...group, ids };
    }).filter((group) => group.ids.length > 0);
  }, [matchingTabIds]);

  useEffect(() => {
    if (!searchQuery.trim()) return;
    if (matchingTabIds && matchingTabIds.size > 0 && !matchingTabIds.has(activeTab)) {
      const firstMatch = TAB_GROUPS.flatMap((g) => g.ids).find((id) => matchingTabIds.has(id));
      if (firstMatch) {
        setActiveTab(firstMatch);
      }
    }
  }, [searchQuery, matchingTabIds, activeTab]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!next ? handleClose() : undefined)}
      maxWidth={880}
      className="p-0 h-[620px] max-h-[86vh] !flex-row overflow-hidden !bg-bg-elevated !border-0"
    >
      <aside className="w-[248px] shrink-0 flex flex-col min-h-0 bg-transparent">
        <div className="px-[12px] pt-[14px] pb-[8px]">
          <div className="relative flex items-center">
            <Search2Line
              size={15}
              className="absolute left-[10px] text-text-tertiary pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("settings.search_placeholder")}
              className="w-full h-[32px] pl-[30px] pr-[26px] bg-border-alpha-14 text-text-primary text-[13px] rounded-[8px] border-0 outline-none placeholder:text-text-tertiary focus:bg-border-alpha-20 transition-colors"
              style={font}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-[6px] p-0 border-0 bg-transparent text-text-tertiary hover:text-text-primary cursor-pointer flex items-center justify-center"
              >
                <CloseCircleFill size={14} />
              </button>
            )}
          </div>
        </div>

        <nav
          className="flex-1 min-h-0 overflow-y-auto px-[12px] pb-[12px] flex flex-col gap-[14px]"
          role="tablist"
          aria-label={t("settings.title")}
        >
          {filteredGroups.length === 0 ? (
            <p className="text-text-tertiary text-[12px] px-[10px] py-[8px] m-0" style={font}>
              {t("search.no_results") || "Ничего не найдено"}
            </p>
          ) : (
            filteredGroups.map((group) => (
            <div key={group.labelKey} className="flex flex-col gap-[2px]">
              <p
                className="text-text-tertiary text-[11px] font-[500] m-0 px-[10px] pb-[4px] pt-[2px]"
                style={font}
              >
                {t(`settings.groups.${group.labelKey}`)}
              </p>
              {group.ids.map((id) => {
                const isActive = id === activeTab;
                const Icon = TAB_ICONS[id];
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(id)}
                    className={`w-full flex items-center gap-[10px] px-[10px] py-[8px] rounded-[8px] border-0 cursor-pointer text-left transition-colors ${
                      isActive
                        ? "bg-border-alpha-14 text-text-primary"
                        : "bg-transparent text-text-secondary hover:bg-border-alpha-14 hover:text-text-primary"
                    }`}
                    style={{ ...font, fontSize: "13.5px", fontWeight: isActive ? 500 : 400 }}
                  >
                    <Icon
                      size={18}
                      weight="Bold"
                      className={isActive ? "text-text-primary shrink-0" : "text-text-tertiary shrink-0"}
                    />
                    <span className="truncate leading-none">{tabLabels[id]}</span>
                  </button>
                );
              })}
            </div>
          )))}

        </nav>

      </aside>

      {/* ── Right secondary frame: same roundness, inset with padding, darker ── */}
      <div className="flex-1 min-w-0 min-h-0 p-[2px] flex">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col rounded-xl bg-bg-primary overflow-hidden">
        <div className="flex items-start justify-between gap-[16px] px-[24px] pt-[20px] pb-[10px] shrink-0">
          <div className="min-w-0">
            <h3
              className="text-text-primary text-[15px] m-0 font-[600] tracking-[-0.01em]"
              style={font}
            >
              {tabLabels[activeTab]}
            </h3>
            <p
              className="text-text-tertiary text-[13px] m-0 mt-[3px] leading-snug"
              style={font}
            >
              {tabDescriptions[activeTab]}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("common.close") || "Close"}
            onClick={handleClose}
            className="w-[28px] h-[28px] shrink-0 inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-text-primary hover:bg-border-alpha-14 transition-colors border-0 bg-transparent p-0 cursor-pointer"
          >
            <CloseLine size={17} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-[24px] pb-[16px] flex flex-col">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="flex-1 flex flex-col"
          >
            <SettingsTabContent tabId={activeTab} searchQuery={searchQuery} />

          </motion.div>
        </div>
        </div>
      </div>
    </Dialog>
  );
}
