import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { color, dateOnly, text } from "@/lib/server/productivity";
import { jsonError } from "@/lib/server/http";

const goalFields = "id,owner_id,title,color,icon,mode,reminder_time,archived_at,version,created_at,updated_at";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const url = new URL(request.url);
    const start = dateOnly(url.searchParams.get("start"));
    const end = dateOnly(url.searchParams.get("end"));
    if ((start && !end) || (!start && end) || (start && end && end < start)) return jsonError(400, "GOAL_RANGE_INVALID", "日期範圍無效");
    const { data: goals, error } = await supabase.from("goals").select(goalFields).order("created_at");
    if (error) return jsonError(500, "GOALS_READ_FAILED", "無法讀取 Goal", true);
    const ids = (goals ?? []).map((item) => item.id);
    if (!ids.length) return NextResponse.json({ goals: [] });
    const { data: members } = await supabase.from("goal_members").select("goal_id,user_id,role,joined_on,left_at").in("goal_id", ids);
    let checkinsQuery = supabase.from("goal_checkins").select("goal_id,user_id,checkin_on,is_backfill,created_at").in("goal_id", ids);
    if (start) checkinsQuery = checkinsQuery.gte("checkin_on", start);
    if (end) checkinsQuery = checkinsQuery.lte("checkin_on", end);
    const { data: checkins } = await checkinsQuery.order("checkin_on");
    const profileIds = [...new Set((members ?? []).map((item) => item.user_id))];
    const { data: profiles } = profileIds.length ? await supabase.from("profiles").select("id,display_name").in("id", profileIds) : { data: [] };
    const names = new Map((profiles ?? []).map((item) => [item.id, item.display_name]));
    return NextResponse.json({ goals: (goals ?? []).map((goal) => ({
      id: goal.id, ownerId: goal.owner_id, title: goal.title, color: goal.color, icon: goal.icon,
      mode: goal.mode, reminderTime: goal.reminder_time, archivedAt: goal.archived_at,
      version: String(goal.version), canManage: goal.owner_id === user.id,
      role: members?.find((member) => member.goal_id === goal.id && member.user_id === user.id)?.role,
      members: (members ?? []).filter((member) => member.goal_id === goal.id && member.left_at == null).map((member) => ({ userId: member.user_id, displayName: names.get(member.user_id) ?? "成員", role: member.role, joinedOn: member.joined_on })),
      checkins: (checkins ?? []).filter((item) => item.goal_id === goal.id).map((item) => ({ userId: item.user_id, date: item.checkin_on, isBackfill: item.is_backfill, createdAt: item.created_at })),
    })) });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 500, auth ? "UNAUTHENTICATED" : "GOALS_READ_FAILED", auth ? "請先登入" : "無法讀取 Goal");
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as Record<string, unknown>;
    const title = text(body.title, 100);
    const icon = text(body.icon, 40) ?? "star";
    const mode = body.mode === "shared" ? "shared" : "personal";
    const reminder = typeof body.reminderTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.reminderTime) ? `${body.reminderTime}:00` : null;
    if (!title) return jsonError(400, "GOAL_TITLE_INVALID", "請輸入 Goal 名稱");
    const { data, error } = await supabase.from("goals").insert({ owner_id: user.id, title, color: color(body.color), icon, mode, reminder_time: reminder }).select(goalFields).single();
    if (error || !data) return jsonError(409, "GOAL_CREATE_FAILED", "無法建立 Goal", true);
    const { error: memberError } = await supabase.from("goal_members").insert({ goal_id: data.id, user_id: user.id, role: "owner" });
    if (memberError) return jsonError(500, "GOAL_MEMBER_CREATE_FAILED", "Goal 已建立但無法設定成員", true);
    return NextResponse.json({ goal: { id: data.id, ownerId: data.owner_id, title: data.title, color: data.color, icon: data.icon, mode: data.mode, reminderTime: data.reminder_time, version: String(data.version), role: "owner", checkins: [] } }, { status: 201 });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 422, auth ? "UNAUTHENTICATED" : "GOAL_CREATE_FAILED", auth ? "請先登入" : "Goal 資料無效");
  }
}
