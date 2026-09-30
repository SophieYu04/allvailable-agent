"use client";
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
type Language = 'zh' | 'en';
const Context = createContext<{language:Language;setLanguage:(value:Language)=>void;t:(zh:string,en:string)=>string}>({ language:'en', setLanguage:()=>{},t:(zh,en)=>en || zh });
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('en');
  useEffect(() => { const timer = setTimeout(() => { try { const saved = localStorage.getItem('yuema.language'); if (saved === 'zh' || saved === 'en') setLanguage(saved); } catch {} },0); return () => clearTimeout(timer); }, []);
  function change(value: Language) { setLanguage(value); try { localStorage.setItem('yuema.language', value); } catch {} }
  useEffect(() => { document.documentElement.lang = language === 'en' ? 'en' : 'zh-Hant'; }, [language]);
  const t = useCallback((zh:string,en:string)=>language === 'en' ? en : zh,[language]);
  return <Context.Provider value={{ language, setLanguage: change, t }}>{children}</Context.Provider>;
}
export const useLanguage = () => useContext(Context);
export function LanguageSwitch() { const { language, setLanguage } = useLanguage(); return <button className="language-switch" aria-label="Change language / 切換語言" onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}>{language === 'zh' ? 'English' : '繁體中文'}</button>; }
