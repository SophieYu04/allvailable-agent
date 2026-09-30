import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { dateOnly, taipeiToday, text } from "@/lib/server/productivity";
import { jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as Record<string, unknown>;
    const date = dateOnly(body.date);
    if (!date || date > taipeiToday()) return jsonError(400, "CHECKIN_DATE_INVALID", "不能替未來日期打卡");
    const { data: member } = await supabase.from("goal_members").select("joined_on,role").eq("goal_id", id).eq("user_id", user.id).is("left_at", null).maybeSingle();
    if (!member || member.role === "viewer") return jsonError(403, "CHECKIN_FORBIDDEN", "你只能查看這個 Goal");
    if (date < member.joined_on) return jsonError(400, "CHECKIN_BEFORE_JOIN", "不能補加入 Goal 以前的打卡");
    const key = text(body.idempotencyKey, 200);
    const { data, error } = await supabase.from("goal_checkins").upsert({ goal_id: id, user_id: user.id, checkin_on: date, is_backfill: date < taipeiToday(), idempotency_key: key }, { onConflict: "goal_id,user_id,checkin_on" }).select("goal_id,user_id,checkin_on,is_backfill,created_at").single();
    if (error || !data) return jsonError(409, "CHECKIN_SAVE_FAILED", "無法保存打卡", true);
    return NextResponse.json({ checkin: { goalId: data.goal_id, userId: data.user_id, date: data.checkin_on, isBackfill: data.is_backfill, createdAt: data.created_at } });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 422, auth ? "UNAUTHENTICATED" : "CHECKIN_SAVE_FAILED", auth ? "請先登入" : "無法保存打卡");
  }
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const date = dateOnly(new URL(request.url).searchParams.get("date"));
    if (!date) return jsonError(400, "CHECKIN_DATE_INVALID", "日期無效");
    const { error } = await supabase.from("goal_checkins").delete().eq("goal_id", id).eq("user_id", user.id).eq("checkin_on", date);
    if (error) return jsonError(409, "CHECKIN_DELETE_FAILED", "無法取消打卡", true);
    return NextResponse.json({ deleted: true, goalId: id, date });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 500, auth ? "UNAUTHENTICATED" : "CHECKIN_DELETE_FAILED", auth ? "請先登入" : "無法取消打卡");
  }
}
