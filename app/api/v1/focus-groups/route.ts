import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { text } from "@/lib/server/productivity";
import { jsonError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const { data: groups, error } = await supabase.from("focus_groups").select("id,owner_id,name,created_at").order("created_at");
    if (error) return jsonError(500, "FOCUS_GROUPS_READ_FAILED", "無法讀取專注群組", true);
    const ids = (groups ?? []).map((item) => item.id);
    const { data: members } = ids.length ? await supabase.from("focus_group_members").select("group_id,user_id,role,joined_at,left_at").in("group_id", ids) : { data: [] };
    const profileIds = [...new Set((members ?? []).map((item) => item.user_id))];
    const { data: profiles } = profileIds.length ? await supabase.from("profiles").select("id,display_name").in("id", profileIds) : { data: [] };
    const names = new Map((profiles ?? []).map((item) => [item.id, item.display_name]));
    return NextResponse.json({ groups: (groups ?? []).map((group) => ({ id: group.id, ownerId: group.owner_id, name: group.name, canManage: group.owner_id === user.id, members: (members ?? []).filter((member) => member.group_id === group.id && member.left_at == null).map((member) => ({ userId: member.user_id, displayName: names.get(member.user_id) ?? "成員", role: member.role, joinedAt: member.joined_at })) })) });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 500, auth ? "UNAUTHENTICATED" : "FOCUS_GROUPS_READ_FAILED", auth ? "請先登入" : "無法讀取專注群組");
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const name = text((await request.json() as { name?: unknown }).name, 80);
    if (!name) return jsonError(400, "GROUP_NAME_INVALID", "請輸入群組名稱");
    const { data, error } = await supabase.from("focus_groups").insert({ owner_id: user.id, name }).select("id,owner_id,name").single();
    if (error || !data) return jsonError(409, "GROUP_CREATE_FAILED", "無法建立群組", true);
    await supabase.from("focus_group_members").insert({ group_id: data.id, user_id: user.id, role: "owner" });
    return NextResponse.json({ group: { id: data.id, ownerId: data.owner_id, name: data.name, canManage: true, members: [] } }, { status: 201 });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 422, auth ? "UNAUTHENTICATED" : "GROUP_CREATE_FAILED", auth ? "請先登入" : "群組資料無效");
  }
}
