import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { deadlineResponse, validateDeadlineInput, type DeadlineInput } from "@/lib/server/deadline-validation";
import { decimalVersion, jsonError, nextDecimalVersion } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };
const fields = "id,title,due_on,completed_at,pinned,pin_order,version,updated_at,idempotency_key";

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const input = (await request.json()) as DeadlineInput;
    const expected = decimalVersion(input.expectedVersion);
    const deadline = await validateDeadlineInput(input);
    const row = { title: deadline.title, due_on: deadline.due_on, pinned: deadline.pinned, pin_order: deadline.pin_order };
    const { data, error } = await supabase
      .from("calendar_deadlines")
      .update({
        ...row,
        completed_at: deadline.completed ? new Date().toISOString() : null,
        version: nextDecimalVersion(expected),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("version", expected)
      .is("deleted_at", null)
      .select(fields)
      .single();
    if (error || !data) return jsonError(409, "VERSION_CONFLICT", "截止事項已被更新，請重新載入", true);
    return NextResponse.json({ deadline: deadlineResponse(data) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "DEADLINE_INVALID";
    return jsonError(code === "UNAUTHENTICATED" ? 401 : code === "VERSION_INVALID" ? 409 : 422, code, code === "UNAUTHENTICATED" ? "請先登入" : "截止事項資料無效");
  }
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const expected = decimalVersion(new URL(request.url).searchParams.get("version"));
    const { data: existing } = await supabase.from("calendar_deadlines")
      .select("id,version,deleted_at").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (existing?.deleted_at) return NextResponse.json({ deleted: true, id, version: String(existing.version) });
    const { data, error } = await supabase
      .from("calendar_deadlines")
      .update({ deleted_at: new Date().toISOString(), version: nextDecimalVersion(expected), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("version", expected)
      .is("deleted_at", null)
      .select("id,version")
      .single();
    if (error || !data) return jsonError(409, "VERSION_CONFLICT", "截止事項已被更新，請重新載入", true);
    return NextResponse.json({ deleted: true, id, version: String(data.version) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "DEADLINE_DELETE_FAILED";
    return jsonError(code === "UNAUTHENTICATED" ? 401 : 409, code, code === "UNAUTHENTICATED" ? "請先登入" : "截止事項已被更新，請重新載入", true);
  }
}

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const { data, error } = await supabase.from("calendar_deadlines")
      .select(fields).eq("user_id", user.id)
      .eq(id.startsWith("mobile-") ? "idempotency_key" : "id", id)
      .is("deleted_at", null).maybeSingle();
    if (error) return jsonError(500, "READ_FAILED", "無法重新載入", true);
    if (!data) return jsonError(404, "NOT_FOUND", "資料已不存在");
    return NextResponse.json({ deadline: deadlineResponse(data) });
  } catch (error) {
    const unauthenticated = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(unauthenticated ? 401 : 500, unauthenticated ? "UNAUTHENTICATED" : "READ_FAILED", unauthenticated ? "請先登入" : "無法重新載入");
  }
}
