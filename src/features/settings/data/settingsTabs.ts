import { DiscordFill, KeyboardLine } from "@mingcute/react";
import {
  Play,
  Palette,
  Gallery,
  HeadphonesRound,
  InfoCircle,
  Database,
  Widget5,
  User,
} from "@solar-icons/react";

export type TabId = "Playback" | "Shortcuts" | "Overlay" | "Discord" | "Appearance" | "Customization" | "Audio" | "Account" | "Storage" | "About";

export const TAB_ICONS: Record<TabId, React.ComponentType<any>> = {
  Playback: Play,
  Shortcuts: KeyboardLine,
  Overlay: Widget5,
  Discord: DiscordFill,
  Appearance: Palette,
  Customization: Gallery,
  Audio: HeadphonesRound,
  Account: User,
  Storage: Database,
  About: InfoCircle,
};

export const TAB_GROUPS: { labelKey: "preferences" | "application"; ids: TabId[] }[] = [
  { labelKey: "preferences", ids: ["Playback", "Shortcuts", "Overlay", "Discord", "Audio", "Appearance", "Customization"] },
  { labelKey: "application", ids: ["Account", "Storage", "About"] },
];


export const SETTING_ITEMS: { tabId: TabId; titleKey: string; descKey?: string }[] = [
  // Playback
  { tabId: "Playback", titleKey: "settings.autoplay_similar.title", descKey: "settings.autoplay_similar.description" },
  { tabId: "Playback", titleKey: "settings.track_double_click.title", descKey: "settings.track_double_click.description" },
  { tabId: "Playback", titleKey: "settings.default_playback_context.title", descKey: "settings.default_playback_context.description" },
  { tabId: "Playback", titleKey: "settings.audio.pause_on_device_change.title", descKey: "settings.audio.pause_on_device_change.description" },

  // Shortcuts
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.global_section", descKey: "settings.shortcuts.global_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.main_app_section", descKey: "settings.shortcuts.main_app_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.miniplayer_section", descKey: "settings.shortcuts.miniplayer_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.toggle_overlay", descKey: "settings.shortcuts.toggle_overlay_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.quick_like_song", descKey: "settings.shortcuts.quick_like_song_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.play_pause", descKey: "settings.shortcuts.play_pause_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.next_track", descKey: "settings.shortcuts.next_track_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.prev_track", descKey: "settings.shortcuts.prev_track_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.like_track", descKey: "settings.shortcuts.like_track_desc" },

  // Overlay
  { tabId: "Overlay", titleKey: "settings.overlay.position.title", descKey: "settings.overlay.position.description" },
  { tabId: "Overlay", titleKey: "settings.overlay.show_lyrics.title", descKey: "settings.overlay.show_lyrics.description" },
  { tabId: "Overlay", titleKey: "settings.overlay.auto_show_on_minimize.title", descKey: "settings.overlay.auto_show_on_minimize.description" },
  { tabId: "Overlay", titleKey: "settings.overlay.always_on_top.title", descKey: "settings.overlay.always_on_top.description" },

  // Discord
  { tabId: "Discord", titleKey: "settings.discord.enable.title", descKey: "settings.discord.enable.description" },
  { tabId: "Discord", titleKey: "settings.discord.show_timeline.title", descKey: "settings.discord.show_timeline.description" },
  { tabId: "Discord", titleKey: "settings.discord.show_artwork.title", descKey: "settings.discord.show_artwork.description" },
  { tabId: "Discord", titleKey: "settings.discord.show_artist_image.title", descKey: "settings.discord.show_artist_image.description" },
  { tabId: "Discord", titleKey: "settings.discord.show_paused.title", descKey: "settings.discord.show_paused.description" },
  { tabId: "Discord", titleKey: "settings.discord.show_button.title", descKey: "settings.discord.show_button.description" },

  // Appearance
  { tabId: "Appearance", titleKey: "settings.language.label", descKey: "settings.language.description" },
  { tabId: "Appearance", titleKey: "settings.theme.title", descKey: "settings.theme.description" },

  // Customization
  { tabId: "Customization", titleKey: "settings.customization.ambient_title", descKey: "settings.customization.ambient_desc" },
  { tabId: "Customization", titleKey: "settings.customization.wallpaper_title", descKey: "settings.customization.wallpaper_description" },
  { tabId: "Customization", titleKey: "settings.customization.blocks_title", descKey: "settings.customization.blocks_description" },
  { tabId: "Customization", titleKey: "settings.customization.reset_all", descKey: "settings.customization.reset_all_desc" },

  // Audio
  { tabId: "Audio", titleKey: "settings.audio.title", descKey: "settings.audio.description" },
  { tabId: "Audio", titleKey: "settings.connection.checks_title" },

  // Storage
  { tabId: "Account", titleKey: "settings.account.title", descKey: "settings.account.intro" },
  { tabId: "Storage", titleKey: "settings.storage.title", descKey: "settings.storage.description" },
  { tabId: "Storage", titleKey: "settings.storage.usage_title" },
  { tabId: "Storage", titleKey: "settings.storage.backup_title", descKey: "settings.storage.backup_description" },
  { tabId: "Storage", titleKey: "settings.storage.open_folder", descKey: "settings.storage.open_folder_description" },

  // About
  { tabId: "About", titleKey: "settings.about.liner", descKey: "common.app.version" },
  { tabId: "About", titleKey: "settings.notifications.test_button" },
];

// Tabs for features that only exist in the desktop (Electron) app.
export const MOBILE_HIDDEN_TABS: ReadonlySet<TabId> = new Set<TabId>(["Shortcuts", "Overlay", "Discord", "Customization"]);
