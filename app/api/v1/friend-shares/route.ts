import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const { data, error } = await supabase.from("friend_shares").select("id,owner_id,friend_id,starts_on,ends_on,can_see_tentative,revoked_at,created_at").or(`owner_id.eq.${user.id},friend_id.eq.${user.id}`).order("created_at", { ascending: false });
    if (error) return jsonError(500, "FRIEND_SHARES_READ_FAILED", "無法讀取好友授權", true);
    return NextResponse.json({ shares: data ?? [] });
  } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as { friendId?: unknown; startsOn?: unknown; endsOn?: unknown; canSeeTentative?: unknown };
    if (typeof body.friendId !== "string" || body.friendId === user.id || !date(body.startsOn) || !date(body.endsOn)) return jsonError(400, "FRIEND_SHARE_INPUT_INVALID", "好友授權資料無效");
    const start = new Date(`${body.startsOn}T00:00:00Z`);
    const end = new Date(`${body.endsOn}T00:00:00Z`);
    if (end < start || end.getTime() - start.getTime() > 30 * 86_400_000) return jsonError(422, "FRIEND_SHARE_RANGE_INVALID", "授權範圍最多 30 天");
    const { data, error } = await supabase.from("friend_shares").upsert({ owner_id: user.id, friend_id: body.friendId, starts_on: body.startsOn, ends_on: body.endsOn, can_see_tentative: body.canSeeTentative !== false, revoked_at: null }, { onConflict: "owner_id,friend_id" }).select("id,owner_id,friend_id,starts_on,ends_on,can_see_tentative,revoked_at,created_at").single();
    if (error || !data) return jsonError(500, "FRIEND_SHARE_CREATE_FAILED", "無法建立好友授權", true);
    return NextResponse.json({ share: data }, { status: 201 });
  } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as { id?: unknown; revoked?: unknown };
    if (typeof body.id !== "string" || body.revoked !== true) return jsonError(400, "FRIEND_SHARE_INPUT_INVALID", "授權設定無效");
    const { error } = await supabase.from("friend_shares").update({ revoked_at: new Date().toISOString() }).eq("id", body.id).eq("owner_id", user.id);
    if (error) return jsonError(500, "FRIEND_SHARE_REVOKE_FAILED", "無法撤銷好友授權", true);
    return NextResponse.json({ revoked: true });
  } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}

function date(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value); }
