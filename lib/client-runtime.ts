export const isPagesClient = process.env.NEXT_PUBLIC_PAGES_CLIENT === 'true';

export function safeAppPath(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') && !/[\\\r\n]/.test(value) ? value : '/';
}

export function appHref(path: string) {
  const safe = safeAppPath(path);
  return isPagesClient ? `${process.env.NEXT_PUBLIC_BASE_PATH || '/'}#${safe}` : safe;
}

export function routeSearch() {
  return isPagesClient ? (window.location.hash.split('?')[1] || '') : window.location.search;
}

export function loginRedirect(next: string) {
  if (!isPagesClient) return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  sessionStorage.setItem('allvailable.auth.next', safeAppPath(next));
  return new URL(process.env.NEXT_PUBLIC_BASE_PATH || '/', window.location.origin).href;
}
