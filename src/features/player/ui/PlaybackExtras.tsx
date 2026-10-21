import { useEffect, useState, useSyncExternalStore } from "react";
import { ClockCircle, Soundwave } from "@solar-icons/react";
import DropdownMenu from "@/shared/ui/DropdownMenu";
import type { DropdownMenuItem } from "@/shared/ui/DropdownMenu";
import { useTranslation } from "@/languages";
import { usePlayerStore } from "../store/playerStore";
import {
  cancelSleepTimer, getSleepTimer, setSleepAfterTrack, setSleepMinutes, subscribeSleepTimer,
} from "../engine/sleepTimer";

const buttonClass = "inline-flex items-center justify-center gap-2 border-none bg-white/5 text-white/65 hover:bg-white/10 hover:text-white active:scale-[0.96] cursor-pointer transition-colors";

export function useSleepTimerMenu(): { label: string; items: DropdownMenuItem[]; active: boolean } {
  const { t } = useTranslation();
  const timer = useSyncExternalStore(subscribeSleepTimer, getSleepTimer, getSleepTimer);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (timer.deadline === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [timer.deadline]);
  const active = timer.deadline !== null || timer.afterTrack;
  const remaining = timer.deadline === null ? null : Math.max(0, Math.ceil((timer.deadline - now) / 60_000));
  const label = timer.afterTrack ? t("player.sleep_after_track") : remaining !== null
    ? t("player.sleep_remaining", { minutes: remaining }) : t("player.sleep_timer");
  const items = [
    ...(active ? [{ id: "off", label: t("player.sleep_off"), onClick: cancelSleepTimer }] : []),
    { id: "track", label: t("player.sleep_after_track"), onClick: setSleepAfterTrack },
    ...[15, 30, 45, 60, 90].map(minutes => ({
      id: String(minutes), label: t("player.sleep_minutes", { minutes }), onClick: () => setSleepMinutes(minutes),
    })),
  ];
  return { label, items, active };
}

export function SleepTimerButton({ compact = false }: { compact?: boolean }) {
  const { label, items, active } = useSleepTimerMenu();
  return (
    <DropdownMenu theme="dark" side="top" trigger={
      <button type="button" aria-label={label} title={label}
        className={`${buttonClass} ${compact ? "h-[44px] w-[44px] rounded-full" : "rounded-full px-3 py-1.5 text-[12px]"} ${active ? "!bg-white/15 !text-white" : ""}`}>
        <ClockCircle size={compact ? 22 : 16} />
        {!compact && <span>{label}</span>}
      </button>
    } items={items} />
  );
}

export function CrossfadeButton({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const seconds = usePlayerStore(state => state.crossfadeSeconds);
  const setSeconds = usePlayerStore(state => state.setCrossfadeSeconds);
  const label = seconds > 0 ? t("player.crossfade_active", { seconds }) : t("player.crossfade");
  const items = [0, 3, 5, 8].map(value => ({
    id: String(value),
    label: `${seconds === value ? "✓ " : ""}${value === 0 ? t("player.crossfade_off") : t("player.crossfade_seconds", { seconds: value })}`,
    onClick: () => setSeconds(value),
  }));
  return (
    <DropdownMenu theme="dark" side="top" trigger={
      <button type="button" aria-label={label} title={label}
        className={`${buttonClass} ${compact ? "h-[44px] w-[44px] rounded-full" : "rounded-full px-3 py-1.5 text-[12px]"} ${seconds > 0 ? "!bg-white/15 !text-white" : ""}`}>
        <Soundwave size={compact ? 22 : 16} />
        {!compact && <span>{label}</span>}
      </button>
    } items={items} />
  );
}
