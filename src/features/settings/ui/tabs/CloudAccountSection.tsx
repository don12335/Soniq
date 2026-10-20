import { useEffect, useState, useSyncExternalStore } from "react";
import Button from "@/shared/ui/Button";
import { useTranslation } from "@/languages";
import {
  acknowledgeCredential, createCloudAccount, getCloudState, getPendingCredential,
  loginCloud, logoutCloud,
  onCloudState, saveCloudEmail, syncCloud,
} from "@/shared/account/account";

export default function CloudAccountSection() {
  const { t } = useTranslation();
  const cloud = useSyncExternalStore(onCloudState, getCloudState, getCloudState);
  const [credential, setCredential] = useState("");
  const [newCredential, setNewCredential] = useState(getPendingCredential);
  const [email, setEmail] = useState(() => getCloudState().session?.account.email ?? "");
  useEffect(() => { setEmail(cloud.session?.account.email ?? ""); }, [cloud.session?.account.email]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return (
    <section className="rounded-2xl border border-border-primary/60 bg-bg-panel p-[16px] dark:border-transparent dark:bg-white/[0.035] text-text-primary">
      <h3 className="m-0 text-[16px] font-semibold">{t("settings.account.title")}</h3>
      {newCredential && (
        <div className="mt-3 rounded-xl border border-amber-500/60 bg-amber-500/10 p-3">
          <p className="m-0 text-[13px]">{t("settings.account.secret_warning")}</p>
          <code className="my-2 block break-all select-all text-[17px]">{newCredential.match(/.{1,6}/g)?.join(" ")}</code>
          <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(newCredential)}>{t("settings.account.copy")}</Button>
          <Button variant="secondary" onClick={() => { acknowledgeCredential(); setNewCredential(""); }}>{t("settings.account.saved")}</Button>
        </div>
      )}
      {cloud.session ? (
        <div className="mt-3 space-y-3 text-[13px]">
          <p className="m-0 text-text-secondary">{cloud.busy ? t("settings.account.syncing") : cloud.lastSync ? t("settings.account.synced") : t("settings.account.waiting")}</p>
          {cloud.error && <p role="alert" className="text-red-500">{t("settings.account.sync_failed", { error: cloud.error })}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy || cloud.busy} onClick={() => void run(syncCloud)}>{t("settings.account.sync_now")}</Button>
            <Button variant="secondary" disabled={busy || Boolean(newCredential)} onClick={() => void run(logoutCloud)}>{t("settings.account.logout")}</Button>
          </div>
          <details className="rounded-xl border border-border-primary/60 p-3">
            <summary className="cursor-pointer font-medium">{t("settings.account.details")}</summary>
            <div className="mt-3 space-y-3">
              <p className="m-0 text-text-secondary">{t("settings.account.mode", { id: cloud.session.account.id.slice(0, 8) })}</p>
              {cloud.lastSync && <p className="m-0 text-text-secondary">{t("settings.account.last_sync", { time: new Date(cloud.lastSync).toLocaleString() })}</p>}
              <label className="block">{t("settings.account.email")}</label>
              <div className="flex flex-wrap gap-2">
                <input type="email" value={email} onChange={event => setEmail(event.target.value)}
                  placeholder={t("settings.account.email_placeholder")}
                  className="min-w-0 flex-1 rounded-lg border border-border-primary bg-bg-elevated px-3 py-2 text-[16px] text-text-primary" />
                <Button variant="secondary" disabled={busy} onClick={() => void run(async () => {
                  await saveCloudEmail(email.trim() || null); setMessage(t("settings.account.email_saved"));
                })}>{t("settings.account.save_email")}</Button>
              </div>
            </div>
          </details>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <p className="m-0 text-[13px] text-text-secondary">{t("settings.account.guest")}</p>
          <Button variant="primary" disabled={busy} onClick={() => void run(async () => {
            setNewCredential(await createCloudAccount());
          })}>{t("settings.account.create")}</Button>
          <div className="flex flex-wrap gap-2">
            <input value={credential} onChange={event => setCredential(event.target.value)}
              inputMode="numeric" autoComplete="off" placeholder={t("settings.account.login_placeholder")}
              className="min-w-0 flex-1 rounded-lg border border-border-primary bg-bg-elevated px-3 py-2 text-[16px] text-text-primary" />
            <Button variant="secondary" disabled={busy} onClick={() => void run(async () => {
              await loginCloud(credential); setCredential("");
            })}>{t("settings.account.login")}</Button>
          </div>
        </div>
      )}
      {message && <p role="status" className="mt-2 text-[13px]">{message}</p>}
    </section>
  );
}
