import { createRoot } from 'react-dom/client';
import { useEffect } from 'react';
import { LanguageProvider } from '@/components/dining/Language';
import DiningHome from '@/components/dining/DiningHome';
import DiningDetail from '@/components/dining/DiningDetail';
import JoinByCode from '@/components/dining/JoinByCode';
import Login from '@/app/login/page';
import Privacy from '@/app/privacy/page';
import Terms from '@/app/terms/page';
import { usePathname } from './navigation';
import { getSupabaseBrowserClient } from './supabase';
import { appHref, safeAppPath, routeSearch } from '@/lib/client-runtime';
import '@/app/globals.css';
import "@/components/dining/product-ui.css";

function App() {
  const path = usePathname();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const main = document.querySelector('main');
    main?.setAttribute('tabindex', '-1');
    main?.focus({ preventScroll: true });
  }, [path]);
  if (path === '/') return <DiningHome key={path}/>;
  if (path === '/history') return <DiningHome key={path} view="history"/>;
  if (path === '/hosting') return <DiningHome key={path} view="hosting"/>;
  if (path === '/login') return <Login/>;
  if (path === '/join') return <JoinByCode initialCode={new URLSearchParams(routeSearch()).get('code') || ''}/>;
  if (path === '/privacy') return <Privacy/>;
  if (path === '/terms') return <Terms/>;
  const gathering = path.match(/^\/gatherings\/([^/]+)$/);
  if (gathering) return <DiningDetail key={path} gatheringId={decodeURIComponent(gathering[1])}/>;
  const join = path.match(/^\/join\/([^/]+)$/);
  if (join) return <DiningDetail key={path} token={decodeURIComponent(join[1])}/>;
  return <main className="legal-page"><h1>Page not found</h1><a href={appHref('/')}>Back to Allvailable</a></main>;
}

async function start() {
  const query = new URLSearchParams(window.location.search);
  const code = query.get('code');
  if (query.has('error')) throw new Error('Sign-in was cancelled or could not be completed. Please try again.');
  if (code) {
    const client = getSupabaseBrowserClient();
    if (!client) throw new Error('Sign-in is not configured.');
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw error;
    const next = safeAppPath(sessionStorage.getItem('allvailable.auth.next'));
    sessionStorage.removeItem('allvailable.auth.next');
    history.replaceState(null, '', appHref(next));
  }
  createRoot(document.getElementById('root')!).render(<LanguageProvider><App/></LanguageProvider>);
}
void start().catch(() => {
  // Remove the one-use authorization code even if exchange fails.
  history.replaceState(null, '', appHref('/login'));
  createRoot(document.getElementById('root')!).render(<main className="legal-page"><h1>Sign-in could not be completed</h1><p>Please return to sign-in and try again in this browser.</p><a href={appHref('/login')}>Try again</a></main>);
});
