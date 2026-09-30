import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

/**
 * Authenticate both the existing browser cookie session and native clients.
 * Native clients send a Supabase access token as a bearer token. The request
 * scoped client carries that token for every subsequent RLS query.
 */
export async function requireUser(request?: Request) {
  const authorization = request?.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("AUTH_NOT_CONFIGURED");
    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data, error } = await supabase.auth.getUser(bearer);
    if (error || !data.user) throw new Error("UNAUTHENTICATED");
    return { supabase, user: data.user };
  }
  const supabase = await getSupabaseServerClient();
  if (!supabase) throw new Error("AUTH_NOT_CONFIGURED");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("UNAUTHENTICATED");
  return { supabase, user: data.user };
}

export function publicProfile(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null }) {
  const metadata = user.user_metadata ?? {};
  return { id: user.id, email: user.email ?? null, displayName: String(metadata.full_name ?? metadata.name ?? user.email?.split("@")[0] ?? "新朋友") };
}
