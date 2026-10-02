"use client";

import { loginRedirect, routeSearch, safeAppPath } from '@/lib/client-runtime';
import { ArrowLeft, CircleAlert, CalendarDays } from "lucide-react";
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
    const next = new URLSearchParams(routeSearch()).get("next") ?? "/";
    const safeNext = safeAppPath(next);
    try {
      const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: loginRedirect(safeNext), queryParams: { prompt: 'select_account' } } });
      if (error) throw error;
    } catch (error) { setMessage(error instanceof Error ? error.message : t('無法開啟 Google 登入，請重試。', 'Unable to open Google sign-in. Please try again.')); setLoading(false); }
  }

  return <main className="login-page dining-login"><LanguageSwitch/><Link className="login-back" href="/"><ArrowLeft size={16} />{t("回到Allvailable", "Back to Allvailable")}</Link><section className="login-card"><div className="login-symbol"><CalendarDays size={24} strokeWidth={1.5} /></div><h1>{t("一起約個時間", "Find time together")}</h1><button className="google-button" onClick={signIn} disabled={loading}><span className="google-g">G</span>{loading ? t("正在前往 Google…", "Opening Google…") : t("使用 Google 登入", "Sign in with Google")}</button>{message && <div className="login-message" role="alert"><CircleAlert size={17} />{message}</div>}</section><p className="login-footer"><Link href="/privacy">{t("隱私說明", "Privacy")}</Link> · <Link href="/terms">{t("服務條款", "Terms")}</Link></p></main>;
}
