import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const { data: gathering, error } = await supabase.from("gatherings").select("id,host_id,status").eq("id", id).single();
    if (error || !gathering) return jsonError(404, "GATHERING_NOT_FOUND", "找不到飯局");
    if (gathering.host_id !== user.id) return jsonError(403, "HOST_REQUIRED", "只有主揪可以重算");
    if (["draft", "finalized", "cancelled"].includes(gathering.status)) return jsonError(409, "GATHERING_LOCKED", "飯局已鎖定");
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? sessionData.session?.access_token;
    const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!base || !publicKey) return jsonError(503, "CALCULATOR_NOT_CONFIGURED", "計算服務尚未設定", true);
    if (!accessToken) return jsonError(401, "UNAUTHENTICATED", "請重新登入");
    const response = await fetch(`${base}/functions/v1/calculate-results`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, apikey: publicKey, "Content-Type": "application/json" }, body: JSON.stringify({ gatheringId: id }) });
    const body = await response.json() as unknown;
    if (!response.ok) return NextResponse.json(body, { status: response.status });
    return NextResponse.json(body);
  } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}
