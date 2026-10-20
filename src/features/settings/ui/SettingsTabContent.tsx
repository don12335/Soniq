import { useTranslation } from "@/languages";
import {
  PlaybackTab,
  ShortcutsTab,
  AppearanceTab,
  CustomizationTab,
  AudioTab,
  StorageTab,
  AboutTab,
  OverlayTab,
  DiscordTab,
} from "./tabs";
import type { TabId } from "../data/settingsTabs";
import CloudAccountSection from "./tabs/CloudAccountSection";

export function useSettingsTabText() {
  const { t } = useTranslation();

  const tabLabels: Record<TabId, string> = {
    Playback: t("settings.tabs.playback"),
    Shortcuts: t("settings.tabs.shortcuts") || "Shortcuts",
    Overlay: t("settings.tabs.overlay") || "Overlay",
    Discord: t("settings.tabs.discord") || "Discord RPC",
    Appearance: t("settings.tabs.appearance"),
    Customization: t("settings.tabs.customization") || "Customization",
    Audio: t("settings.tabs.audio"),
    Account: t("settings.account.title"),
    Storage: t("settings.tabs.storage"),
    About: t("settings.tabs.about"),
  };

  const tabDescriptions: Record<TabId, string> = {
    Playback: t("settings.playback.description"),
    Shortcuts: t("settings.shortcuts.description") || "System-wide and player keyboard shortcuts.",
    Overlay: t("settings.overlay.description") || "Desktop overlay behavior, position and lyrics display.",
    Discord: t("settings.discord.description") || "Show what you're listening to on Discord with artwork, artist badge and progress bar.",
    Appearance: t("settings.theme.description"),
    Customization: t("settings.customization.description") || "Window background wallpaper, transparency and block blur effects.",
    Audio: t("settings.audio.description"),
    Account: t("settings.account.description"),
    Storage: t("settings.storage.description"),
    About: t("settings.about.tagline"),
  };

  return { tabLabels, tabDescriptions };
}

export function SettingsTabContent({ tabId: activeTab, searchQuery = "" }: { tabId: TabId; searchQuery?: string }) {
  return (
    <>
      {activeTab === "Playback" && <PlaybackTab searchQuery={searchQuery} />}
      {activeTab === "Shortcuts" && <ShortcutsTab searchQuery={searchQuery} />}
      {activeTab === "Overlay" && <OverlayTab searchQuery={searchQuery} />}
      {activeTab === "Discord" && <DiscordTab searchQuery={searchQuery} />}
      {activeTab === "Appearance" && <AppearanceTab searchQuery={searchQuery} />}
      {activeTab === "Customization" && <CustomizationTab searchQuery={searchQuery} />}
      {activeTab === "Audio" && <AudioTab searchQuery={searchQuery} />}
      {activeTab === "Account" && <CloudAccountSection />}
      {activeTab === "Storage" && <StorageTab searchQuery={searchQuery} />}
      {activeTab === "About" && <AboutTab searchQuery={searchQuery} />}
    </>
  );
}
