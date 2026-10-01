import { useSyncExternalStore, type AnchorHTMLAttributes } from 'react';
import { appHref, safeAppPath } from '@/lib/client-runtime';
const subscribe = (callback: () => void) => {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
};
export function useRoute() {
  return useSyncExternalStore(subscribe, () => window.location.hash.slice(1) || '/', () => '/');
}
export function usePathname() { return useRoute().split('?')[0]; }
export function useRouter() {
  return {
    push: (path: string) => { window.location.hash = safeAppPath(path); },
    replace: (path: string) => { window.location.replace(appHref(path)); },
    refresh: () => window.location.reload(),
    back: () => window.history.back(),
  };
}
export default function Link({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props} href={href.startsWith('/') ? appHref(href) : href} />;
}
