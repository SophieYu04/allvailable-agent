import { NextResponse } from "next/server";
import { gatheringInputSchema } from "@/lib/server/gatherings";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser(request);
    const { data, error } = await supabase.rpc("list_gatherings");
    if (error) return jsonError(500, "GATHERING_LIST_FAILED", "無法讀取飯局", true);
    return NextResponse.json({ gatherings: data ?? [] });
  } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await requireUser(request);
    const body = await request.json() as Record<string, unknown>;
    const parsed = gatheringInputSchema.safeParse(body);
    if (!parsed.success) return jsonError(400, "GATHERING_INVALID", parsed.error.issues[0]?.message ?? "飯局設定無效");
    const requestKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : request.headers.get("Idempotency-Key") ?? crypto.randomUUID();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestKey)) return jsonError(400, "KEY_INVALID", "建立識別碼無效");
    const { data, error } = await supabase.rpc("create_gathering_once", { p_key: requestKey, p_input: parsed.data });
    if (error) {
      if (error.message.includes("IDEMPOTENCY_CONFLICT")) return jsonError(409, "IDEMPOTENCY_CONFLICT", "這次建立已成功，但內容已更改；請關閉表單並重新載入邀約");
      if (error.message.includes("GATHERING_DEADLINE_PAST")) return jsonError(400, "GATHERING_DEADLINE_PAST", "提交截止必須在未來");
      if (error.message.includes("GATHERING_DEADLINE_INVALID")) return jsonError(400, "GATHERING_DEADLINE_INVALID", "提交截止必須早於最早候選時間");
      if (error.message.includes("GATHERING_INVALID")) return jsonError(400, "GATHERING_INVALID", "飯局設定無效");
      return jsonError(500, "GATHERING_CREATE_FAILED", "建立飯局失敗", true);
    }
    if (!data) return jsonError(500, "GATHERING_CREATE_FAILED", "建立飯局失敗", true);
    return NextResponse.json({ gathering: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNAUTHENTICATED")) return jsonError(401, "UNAUTHENTICATED", "請先登入");
    if (message.includes("GATHERING_DEADLINE_PAST")) return jsonError(400, "GATHERING_DEADLINE_PAST", "提交截止必須在未來");
    if (message.includes("GATHERING_DEADLINE_INVALID")) return jsonError(400, "GATHERING_DEADLINE_INVALID", "提交截止必須早於最早候選時間");
    return jsonError(500, "GATHERING_CREATE_FAILED", "建立飯局失敗", true);
  }
}
