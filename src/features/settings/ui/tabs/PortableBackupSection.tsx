import { useRef, useState } from "react";
import Button from "@/shared/ui/Button";
import { useTranslation } from "@/languages";
import { isNative } from "@/shared/platform";
import {
  applyPortableImport, createPortableBackup, MAX_BACKUP_BYTES,
  preparePortableImport, type ImportPlan,
} from "@/shared/backup/portableBackup";

async function saveBackup(content: string, filename: string): Promise<boolean> {
  if (window.linerElectron?.saveDump) {
    const result = await window.linerElectron.saveDump({ filename, content });
    if (!result.success && !result.canceled) throw new Error(result.error || "Could not save backup.");
    return result.success;
  }
  if (isNative()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"), import("@capacitor/share"),
    ]);
    const saved = await Filesystem.writeFile({
      path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8,
    });
    await Share.share({ title: "Soniq backup", files: [saved.uri] });
    return true;
  }
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}

export default function PortableBackupSection() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState("");

  const messageFor = (cause: unknown) => {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (/too large/i.test(message)) return t("settings.storage.backup_too_large");
    if (/invalid backup|not a supported|invalid backup data/i.test(message)) {
      return t("settings.storage.backup_invalid");
    }
    return t("settings.storage.backup_failed");
  };

  const exportBackup = async () => {
    setError("");
    setBusy(true);
    try {
      const content = createPortableBackup();
      const date = new Date().toISOString().slice(0, 10);
      await saveBackup(content, `Soniq-backup-${date}.json`);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  const selectBackup = async (file?: File) => {
    setPlan(null);
    setError("");
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setError(t("settings.storage.backup_too_large"));
      return;
    }
    setBusy(true);
    try {
      setPlan(preparePortableImport(await file.text()));
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = () => {
    if (!plan) return;
    setError("");
    try { applyPortableImport(plan); }
    catch (cause) { setError(messageFor(cause)); }
  };

  return (
    <section className="rounded-2xl border border-border-primary/60 bg-bg-panel p-[16px] dark:border-transparent dark:bg-white/[0.035]">
      <h3 className="m-0 text-[16px] font-semibold text-text-primary">{t("settings.storage.backup_title")}</h3>
      <p className="mb-[14px] mt-[5px] text-[13px] leading-relaxed text-text-secondary">
        {t("settings.storage.backup_description")}
      </p>
      <div className="flex flex-wrap gap-[8px]">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void exportBackup()}>
          {t("settings.storage.backup_export")}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
          {t("settings.storage.backup_import")}
        </Button>
      </div>
      <input
        ref={inputRef} type="file" accept=".json,application/json" className="hidden"
        onChange={(event) => {
          void selectBackup(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {plan && (
        <div className="mt-[14px] rounded-xl bg-border-alpha-14 p-[12px]">
          <p className="m-0 text-[13px] leading-relaxed text-text-primary">
            {t("settings.storage.backup_preview", plan.counts)}
          </p>
          <p className="mb-[10px] mt-[5px] text-[12px] leading-relaxed text-text-secondary">
            {t("settings.storage.backup_merge_notice")}
          </p>
          <div className="flex gap-[8px]">
            <Button type="button" variant="primary" onClick={confirmImport}>
              {t("settings.storage.backup_confirm")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPlan(null)}>
              {t("settings.storage.backup_cancel")}
            </Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mb-0 mt-[10px] text-[12px] text-red-500">{error}</p>}
    </section>
  );
}
