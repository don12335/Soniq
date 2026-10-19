import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useTranslation, LOCALE_OPTIONS } from "@/languages";
import { Select } from "@/shared/ui";
import { useCustomizationStore } from "../../store/customizationStore";
import { SettingBlock, SettingRow, SettingSection } from "../controls";

const font = { fontFamily: "var(--font-inter), sans-serif" } as const;

// tiny dashboard mock so theme choice reads visually instead of as text
function ThemeMock({ mode }: { mode: "light" | "dark" | "gradient" }) {
  const dark = mode !== "light";
  const gradient = mode === "gradient";
  return (
    <div className={`flex h-full w-full ${gradient ? "bg-gradient-to-br from-[#263e93] via-[#302468] to-[#704686]" : dark ? "bg-[#101012]" : "bg-[#ececee]"}`}>
      <div className={`flex w-[36%] flex-col gap-[4px] p-[8px] ${gradient ? "bg-[#232443]/70" : dark ? "bg-[#1c1c1e]" : "bg-white"}`}>
        <div className="flex gap-[3px] px-[1px] pb-[3px]">
          <span className="h-[4px] w-[4px] rounded-full bg-[#ff5f57]" />
          <span className="h-[4px] w-[4px] rounded-full bg-[#febc2e]" />
          <span className="h-[4px] w-[4px] rounded-full bg-[#28c840]" />
        </div>
        {[22, 16, 20].map((w, i) => (
          <span
            key={i}
            className={`h-[5px] rounded-full ${dark ? "bg-white/15" : "bg-black/10"}`}
            style={{ width: w }}
          />
        ))}
        <span className={`mt-auto h-[12px] rounded-[3px] ${gradient ? "bg-[#c4c4ff]/60" : dark ? "bg-white/20" : "bg-black/15"}`} />
      </div>
      <div className="flex flex-1 flex-col gap-[4px] p-[8px]">
        <span className={`h-[6px] w-[46px] rounded-full ${dark ? "bg-white/25" : "bg-black/20"}`} />
        <div className="grid grid-cols-2 gap-[4px]">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-[14px] rounded-[3px] ${gradient ? "bg-white/20" : dark ? "bg-white/10" : "bg-black/[0.07]"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ThemeCard({
  mode,
  label,
  active,
  onSelect,
}: {
  mode: "light" | "dark" | "system" | "gradient";
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className="group flex flex-col gap-[6px] border-0 bg-transparent p-0 text-left cursor-pointer"
    >
      <span
        className={`relative block h-[76px] w-full overflow-hidden rounded-lg border transition-colors ${
          active
            ? "border-text-primary ring-1 ring-text-primary"
            : "border-border-primary group-hover:border-text-tertiary"
        }`}
      >
        {mode === "system" ? (
          <span className="flex h-full w-full">
            <span className="h-full w-1/2 overflow-hidden">
              <ThemeMock mode="light" />
            </span>
            <span className="h-full w-1/2 overflow-hidden">
              <ThemeMock mode="dark" />
            </span>
          </span>
        ) : (
          <ThemeMock mode={mode} />
        )}
        {active ? (
          <span className="absolute right-[6px] top-[6px] flex h-[18px] w-[18px] items-center justify-center rounded-full bg-text-primary">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M2 6.5L4.5 9L10 3"
                stroke="var(--color-bg-primary)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        ) : null}
      </span>
      <span
        className={`text-[12.5px] leading-none ${
          active ? "text-text-primary" : "text-text-secondary"
        }`}
        style={{ ...font, fontWeight: active ? 500 : 400 }}
      >
        {label}
      </span>
    </button>
  );
}

export function AppearanceTab({ searchQuery }: { searchQuery?: string }) {
  const { t, locale, setLocale } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const gradientThemeEnabled = useCustomizationStore((state) => state.gradientThemeEnabled);
  const setGradientThemeEnabled = useCustomizationStore((state) => state.setGradientThemeEnabled);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <SettingSection>
      <SettingRow
        title={t("settings.language.label")}
        description={t("settings.language.description")}
        titleKey="settings.language.label"
        descKey="settings.language.description"
        searchQuery={searchQuery}
        control={
          mounted ? (
            <Select
              options={LOCALE_OPTIONS}
              value={locale}
              onChange={setLocale}
              align="bottom-right"
              className="min-w-[130px]"
              aria-label={t("settings.language.label")}
            />
          ) : (
            <span />
          )
        }
      />

      <SettingBlock
        title={t("settings.theme.title")}
        description={t("settings.theme.description")}
        titleKey="settings.theme.title"
        descKey="settings.theme.description"
        searchQuery={searchQuery}
      >
        {mounted ? (
          <div className="grid grid-cols-4 gap-[10px]">
            {(
              [
                { value: "system", label: t("settings.theme.system") },
                { value: "light", label: t("settings.theme.light") },
                { value: "dark", label: t("settings.theme.dark") },
                { value: "gradient", label: t("settings.theme.gradient") },
              ] as const
            ).map((item) => (
                <ThemeCard
                  key={item.value}
                  mode={item.value}
                  label={item.label}
                  active={item.value === "gradient" ? theme === "dark" && gradientThemeEnabled : theme === item.value && !gradientThemeEnabled}
                  onSelect={() => {
                    setGradientThemeEnabled(item.value === "gradient");
                    setTheme(item.value === "gradient" ? "dark" : item.value);
                  }}
                />
            ))}
          </div>
        ) : null}
      </SettingBlock>

    </SettingSection>
  );
}
