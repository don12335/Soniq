import { useEffect, useState, useSyncExternalStore } from "react";
import Button from "@/shared/ui/Button";
import { useTranslation } from "@/languages";
import {
  acknowledgeCredential, createCloudAccount, getCloudServer, getCloudState, getPendingCredential,
  loginCloud, logoutCloud,
  onCloudState, saveCloudEmail, setCloudServer, syncCloud,
} from "@/shared/account/account";

export default function CloudAccountSection() {
  const { t } = useTranslation();
  const cloud = useSyncExternalStore(onCloudState, getCloudState, getCloudState);
  const [url, setUrl] = useState(getCloudServer);
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
  const saveServer = () => { setCloudServer(url); setUrl(getCloudServer()); };
  return (
    <section className="rounded-2xl border border-border-primary/60 bg-bg-panel p-[16px] dark:border-transparent dark:bg-white/[0.035] text-text-primary">
      <h3 className="m-0 text-[16px] font-semibold">{t("settings.account.title")}</h3>
      <p className="mt-[5px] text-[13px] leading-relaxed text-text-secondary">
        {t("settings.account.intro")}
      </p>
      <label className="block text-[13px] mb-[6px]">{t("settings.account.server")}</label>
      <div className="flex gap-[8px] mb-[14px]">
        <input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://你的 VPS IP"
          autoCapitalize="none" autoCorrect="off" className="min-w-0 flex-1 rounded-lg border border-border-primary bg-bg-elevated px-3 py-2 text-[16px] text-text-primary" />
        <Button variant="secondary" onClick={() => { try { saveServer(); setMessage(t("settings.account.server_saved")); } catch (error) { setMessage(String(error)); } }}>{t("settings.account.save")}</Button>
      </div>
      {newCredential && (
        <div className="mb-4 rounded-xl border border-amber-500/60 bg-amber-500/10 p-3">
          <p className="m-0 text-[13px]">{t("settings.account.secret_warning")}</p>
          <code className="my-2 block break-all select-all text-[17px]">{newCredential.match(/.{1,6}/g)?.join(" ")}</code>
          <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(newCredential)}>{t("settings.account.copy")}</Button>
          <Button variant="secondary" onClick={() => { acknowledgeCredential(); setNewCredential(""); }}>{t("settings.account.saved")}</Button>
        </div>
      )}
      {cloud.session ? (
        <div className="space-y-3 text-[13px]">
          <p className="m-0">{t("settings.account.mode", { id: cloud.session.account.id.slice(0, 8) })}</p>
          <p className="m-0">{cloud.busy ? t("settings.account.syncing") : cloud.lastSync ? t("settings.account.last_sync", { time: new Date(cloud.lastSync).toLocaleString() }) : t("settings.account.waiting")}</p>
          {cloud.error && <p role="alert" className="text-red-500">{t("settings.account.sync_failed", { error: cloud.error })}</p>}
          <div className="flex gap-2">
            <Button variant="secondary" disabled={busy || cloud.busy} onClick={() => void run(syncCloud)}>{t("settings.account.sync_now")}</Button>
            <Button variant="secondary" disabled={busy || Boolean(newCredential)} onClick={() => void run(logoutCloud)}>{t("settings.account.logout")}</Button>
          </div>
          <label className="block">{t("settings.account.email")}</label>
          <div className="flex gap-2">
            <input type="email" value={email} onChange={event => setEmail(event.target.value)}
              placeholder={t("settings.account.email_placeholder")}
              className="min-w-0 flex-1 rounded-lg border border-border-primary bg-bg-elevated px-3 py-2 text-[16px] text-text-primary" />
            <Button variant="secondary" disabled={busy} onClick={() => void run(async () => {
              await saveCloudEmail(email.trim() || null); setMessage(t("settings.account.email_saved"));
            })}>{t("settings.account.save_email")}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="m-0 text-[13px] text-text-secondary">{t("settings.account.guest")}</p>
          <Button variant="primary" disabled={busy} onClick={() => void run(async () => {
            saveServer(); setNewCredential(await createCloudAccount());
          })}>{t("settings.account.create")}</Button>
          <div className="flex gap-2">
            <input value={credential} onChange={event => setCredential(event.target.value)}
              inputMode="numeric" autoComplete="off" placeholder={t("settings.account.login_placeholder")}
              className="min-w-0 flex-1 rounded-lg border border-border-primary bg-bg-elevated px-3 py-2 text-[16px] text-text-primary" />
            <Button variant="secondary" disabled={busy} onClick={() => void run(async () => {
              saveServer(); await loginCloud(credential); setCredential("");
            })}>{t("settings.account.login")}</Button>
          </div>
        </div>
      )}
      {message && <p role="status" className="mt-2 text-[13px]">{message}</p>}
    </section>
  );
}
