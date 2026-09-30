"use client";

import { ArrowLeft, CheckCircle2, LockKeyhole, Sparkles } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import "@/components/dining/dining.css";
import { LanguageSwitch, useLanguage } from "@/components/dining/Language";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const {t}=useLanguage();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function signIn() {
    const client = getSupabaseBrowserClient();
    if (!client) { setMessage(t("目前尚未連接登入服務，請稍後再試。", "Sign-in is not configured yet. Please try later.")); return; }
    setLoading(true);
    const next = new URLSearchParams(window.location.search).get("next") ?? "/";
    const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
    const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}` } });
    if (error) { setMessage(error.message); setLoading(false); }
  }

  return <main className="login-page dining-login"><LanguageSwitch/><Link className="login-back" href="/"><ArrowLeft size={16} />{t("回到Allvailable", "Back to Allvailable")}</Link><section className="login-card"><div className="login-symbol"><Sparkles size={22} /></div><p className="eyebrow">WELCOME TO Allvailable</p><h1>{t("先登入，", "Sign in,")}<br /><em>{t("再一起約。", "find time together.")}</em></h1><p className="login-copy">{t("不需開啟行事曆權限。", "No calendar access needed.")}</p><button className="google-button" onClick={signIn} disabled={loading}><span className="google-g">G</span>{loading ? t("正在前往 Google…", "Opening Google…") : t("使用 Google 登入", "Sign in with Google")}</button>{message && <div className="login-message"><CheckCircle2 size={17} />{message}</div>}<div className="login-safe"><LockKeyhole size={16} /><span>{t("私人行程不公開。", "Your calendar stays private.")}</span></div></section><p className="login-footer"><Link href="/privacy">{t("隱私說明", "Privacy")}</Link> · <Link href="/terms">{t("服務條款", "Terms")}</Link></p></main>;
}
