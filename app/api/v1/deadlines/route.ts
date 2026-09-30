import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import {
  dateOnly,
  deadlineResponse,
  validateDeadlineInput,
  type DeadlineInput,
} from "@/lib/server/deadline-validation";
import { jsonError } from "@/lib/server/http";

const fields = "id,title,due_on,completed_at,pinned,pin_order,version,updated_at,idempotency_key,deleted_at";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const url = new URL(request.url);
    const startDate = dateOnly(url.searchParams.get("startDate"));
    const endDateExclusive = dateOnly(url.searchParams.get("endDateExclusive"));
    const all = url.searchParams.get("all") === "true";
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (all && (!Number.isSafeInteger(offset) || offset < 0)) return jsonError(400, "DEADLINE_PAGE_INVALID", "分頁無效");
    if (!all && (!startDate || !endDateExclusive || endDateExclusive <= startDate)) {
      return jsonError(400, "DEADLINE_RANGE_INVALID", "日期範圍無效");
    }
    const rangeDays =
      (Date.parse(`${endDateExclusive}T00:00:00Z`) -
        Date.parse(`${startDate}T00:00:00Z`)) /
      86_400_000;
    if (!all && rangeDays > 366) {
      return jsonError(400, "DEADLINE_RANGE_INVALID", "日期範圍無效");
    }
    let query = supabase.from("calendar_deadlines").select(fields)
      .eq("user_id", user.id).is("deleted_at", null)
      .order("due_on", { ascending: true }).order("id", { ascending: true });
    if (all) query = query.range(offset, offset + 199);
    else query = query.gte("due_on", startDate!).lt("due_on", endDateExclusive!);
    const { data, error } = await query;
    if (error) return jsonError(500, "DEADLINES_READ_FAILED", "無法讀取截止事項", true);
    let rows = data ?? [];
    if (!all) {
      const { data: pinned } = await supabase.from("calendar_deadlines").select(fields).eq("user_id", user.id).eq("pinned", true).is("deleted_at", null).order("pin_order").order("due_on");
      const byId = new Map([...rows, ...(pinned ?? [])].map((item) => [item.id, item]));
      rows = [...byId.values()];
    }
    return NextResponse.json({ deadlines: rows.map(deadlineResponse), nextOffset: all && data?.length === 200 ? offset + 200 : null });
  } catch (error) {
    return jsonError(
      error instanceof Error && error.message === "UNAUTHENTICATED" ? 401 : 500,
      error instanceof Error && error.message === "UNAUTHENTICATED"
        ? "UNAUTHENTICATED"
        : "DEADLINES_READ_FAILED",
      error instanceof Error && error.message === "UNAUTHENTICATED" ? "請先登入" : "無法讀取截止事項",
    );
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const deadline = await validateDeadlineInput((await request.json()) as DeadlineInput);
    if (deadline.idempotency_key) {
      const { data: replay } = await supabase
        .from("calendar_deadlines")
        .select(fields)
        .eq("user_id", user.id)
        .eq("idempotency_key", deadline.idempotency_key)
        .maybeSingle();
      if (replay) return NextResponse.json({ deadline: deadlineResponse(replay), replayed: true, deleted: replay.deleted_at != null });
    }
    const { completed, ...row } = deadline;
    const { data, error } = await supabase
      .from("calendar_deadlines")
      .insert({ user_id: user.id, ...row, completed_at: completed ? new Date().toISOString() : null })
      .select(fields)
      .single();
    if (error || !data) return jsonError(409, "DEADLINE_CREATE_FAILED", "截止事項無法建立，請重試", true);
    return NextResponse.json({ deadline: deadlineResponse(data) }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "DEADLINE_INVALID";
    return jsonError(code === "UNAUTHENTICATED" ? 401 : 422, code, code === "UNAUTHENTICATED" ? "請先登入" : "截止事項資料無效");
  }
}
