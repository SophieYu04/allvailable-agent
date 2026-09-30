import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { color, text } from "@/lib/server/productivity";
import { decimalVersion, jsonError, nextDecimalVersion } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as Record<string, unknown>;
    const expected = decimalVersion(body.expectedVersion);
    const name = text(body.name, 80);
    if (!name) return jsonError(400, "SUBJECT_NAME_INVALID", "請輸入科目名稱");
    const { data, error } = await supabase.from("subjects").update({ name, color: color(body.color), archived_at: body.archived === true ? new Date().toISOString() : null, version: nextDecimalVersion(expected) }).eq("id", id).eq("user_id", user.id).eq("version", expected).select("id,name,color,archived_at,version").single();
    if (error || !data) return jsonError(409, "VERSION_CONFLICT", "科目已更新，請重新載入", true);
    return NextResponse.json({ subject: { id: data.id, name: data.name, color: data.color, archivedAt: data.archived_at, version: String(data.version) } });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 422, auth ? "UNAUTHENTICATED" : "SUBJECT_UPDATE_FAILED", auth ? "請先登入" : "無法更新科目");
  }
}
