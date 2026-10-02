"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useLanguage } from "./Language";
import "./navigation-menu.css";

export default function NavigationMenu({ accountEnabled = true, onRefresh, refreshDisabled = false }: { accountEnabled?: boolean; onRefresh?: () => void; refreshDisabled?: boolean }) {
  const { language, setLanguage, t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!accountEnabled) return;
    let active = true;
    const client = getSupabaseBrowserClient();
    void client?.auth.getUser().then(({ data }) => { if (active) { setSignedIn(Boolean(data.user)); setAccountEmail(data.user?.email ?? null); } });
    const subscription = client?.auth.onAuthStateChange((_event, session) => { setSignedIn(Boolean(session?.user)); setAccountEmail(session?.user?.email ?? null); });
    return () => { active = false; subscription?.data.subscription.unsubscribe(); };
  }, [accountEnabled]);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  async function signOut() {
    setBusy(true); setError(false);
    try {
      const client = getSupabaseBrowserClient();
      if (!client) throw new Error("Not configured");
      const { error } = await client.auth.signOut();
      if (error) throw error;
      setOpen(false); router.push("/"); router.refresh();
    } catch { setError(true); } finally { setBusy(false); }
  }
  return <div className="navigation-menu" ref={root}>
    <button ref={trigger} type="button" className="navigation-toggle" aria-label={t("選單", "Menu")} aria-expanded={open} aria-controls="account-navigation" onClick={() => setOpen(value => !value)}><Menu size={22} aria-hidden="true"/></button>
    {open && <nav id="account-navigation" className="navigation-panel" aria-label={t("帳號與語言", "Account and language")}>
      {signedIn && accountEmail && <p className="navigation-account">{accountEmail}</p>}
      {accountEnabled && <>
        <Link href="/" onClick={()=>setOpen(false)}>{t('接下來的聚會','Upcoming')}</Link>
        <Link href="/hosting" onClick={()=>setOpen(false)}>{t('我發起的','Hosting')}</Link>
        <Link href="/history" onClick={()=>setOpen(false)}>{t('歷史聚會','History')}</Link>
        <button type="button" disabled={refreshDisabled} onClick={()=>{setOpen(false);if(onRefresh)onRefresh();else router.refresh();}}>{t('重新整理','Refresh')}</button>
        <hr/>
      </>}
      <button type="button" onClick={() => { setLanguage(language === "en" ? "zh" : "en"); setOpen(false); }}>{language === "en" ? "繁體中文" : "English"}</button>
      {accountEnabled && (signedIn ? <button type="button" disabled={busy} onClick={signOut}>{t("登出", "Sign out")}</button> : <Link href={`/login?next=${encodeURIComponent(pathname === "/login" ? "/" : pathname)}`} onClick={() => setOpen(false)}>{t("登入", "Sign in")}</Link>)}
      {error && <p role="alert">{t("登出失敗，請重試", "Sign out failed. Retry.")}</p>}
    </nav>}
  </div>;
}
