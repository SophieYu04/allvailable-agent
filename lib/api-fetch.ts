import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { isPagesClient } from './client-runtime';

/** Only the configured API receives the current user's token; provider keys never enter this client. */
export async function apiFetch(path: string, init: RequestInit = {}) {
  if (!path.startsWith('/api/')) throw new Error('Invalid API path');
  if (!isPagesClient) return fetch(path, init);
  const origin = process.env.NEXT_PUBLIC_API_ORIGIN;
  if (!origin || new URL(origin).protocol !== 'https:') throw new Error('The service is not connected yet. Please try again later.');
  const client = getSupabaseBrowserClient();
  const session = await client?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) return Response.json({ error: { message: 'Please sign in to continue.' } }, { status: 401 });
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(new URL(path, origin), { ...init, headers, credentials: 'omit', redirect: 'error' });
}
