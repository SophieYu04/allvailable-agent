import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { color, text } from "@/lib/server/productivity";
import { jsonError } from "@/lib/server/http";

const fields = "id,owner_id,name,color,kind,version,created_at,updated_at";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const result = await supabase.from("shared_calendars").select(fields).is("deleted_at", null).order("created_at");
    let calendars = result.data;
    const error = result.error;
    if (error) return jsonError(500, "CALENDARS_READ_FAILED", "無法讀取日曆", true);
    if (!calendars?.length) {
      const { data: created, error: createError } = await supabase.from("shared_calendars").insert({ owner_id: user.id, name: "我的行事曆", color: "sage", kind: "personal" }).select(fields).single();
      if (createError || !created) return jsonError(500, "CALENDAR_BOOTSTRAP_FAILED", "無法建立個人日曆", true);
      await supabase.from("calendar_members").insert({ calendar_id: created.id, user_id: user.id, role: "owner" });
      calendars = [created];
    }
    const ids = calendars.map((item) => item.id);
    const { data: members } = await supabase.from("calendar_members").select("calendar_id,user_id,role,joined_at").in("calendar_id", ids);
    const userIds = [...new Set((members ?? []).map((item) => item.user_id))];
    const { data: profiles } = userIds.length ? await supabase.from("profiles").select("id,display_name").in("id", userIds) : { data: [] };
    const names = new Map((profiles ?? []).map((item) => [item.id, item.display_name]));
    return NextResponse.json({ calendars: calendars.map((item) => ({
      id: item.id, ownerId: item.owner_id, name: item.name, color: item.color, kind: item.kind,
      version: String(item.version), canManage: item.owner_id === user.id,
      role: members?.find((member) => member.calendar_id === item.id && member.user_id === user.id)?.role,
      members: (members ?? []).filter((member) => member.calendar_id === item.id).map((member) => ({ userId: member.user_id, displayName: names.get(member.user_id) ?? "成員", role: member.role })),
    })) });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 500, auth ? "UNAUTHENTICATED" : "CALENDARS_READ_FAILED", auth ? "請先登入" : "無法讀取日曆");
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as Record<string, unknown>;
    const name = text(body.name, 80);
    if (!name) return jsonError(400, "CALENDAR_NAME_INVALID", "請輸入日曆名稱");
    const { data, error } = await supabase.from("shared_calendars").insert({ owner_id: user.id, name, color: color(body.color), kind: body.kind === "personal" ? "personal" : "shared" }).select(fields).single();
    if (error || !data) return jsonError(409, "CALENDAR_CREATE_FAILED", "無法建立日曆", true);
    const { error: memberError } = await supabase.from("calendar_members").insert({ calendar_id: data.id, user_id: user.id, role: "owner" });
    if (memberError) return jsonError(500, "CALENDAR_MEMBER_CREATE_FAILED", "日曆已建立但無法設定成員", true);
    return NextResponse.json({ calendar: { id: data.id, ownerId: data.owner_id, name: data.name, color: data.color, kind: data.kind, role: "owner", version: String(data.version) } }, { status: 201 });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 422, auth ? "UNAUTHENTICATED" : "CALENDAR_CREATE_FAILED", auth ? "請先登入" : "日曆資料無效");
  }
}
