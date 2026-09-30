import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const { data: gathering, error: readError } = await supabase.from("gatherings").select("id,host_id,status").eq("id", id).single();
    if (readError || !gathering) return jsonError(404, "GATHERING_NOT_FOUND", "找不到飯局");
    if (gathering.host_id !== user.id) return jsonError(403, "HOST_REQUIRED", "只有主揪可以取消飯局");
    if (["finalized", "cancelled"].includes(gathering.status)) return jsonError(409, "GATHERING_LOCKED", "飯局已鎖定");
    const { data, error } = await supabase.rpc("cancel_gathering", { p_id: id });
    if (error || !data) return jsonError(409, "GATHERING_LOCKED", "飯局狀態已更新，請重新載入", true);
    return NextResponse.json({ gathering: data });
  } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}
