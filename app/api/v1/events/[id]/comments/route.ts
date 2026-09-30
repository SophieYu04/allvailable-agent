import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { text } from "@/lib/server/productivity";
import { jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase } = await requireUser(request);
    const { data, error } = await supabase.from("calendar_event_comments").select("id,user_id,body,created_at,updated_at").eq("event_id", id).is("deleted_at", null).order("created_at");
    if (error) return jsonError(403, "COMMENTS_FORBIDDEN", "你不是此日曆的成員");
    const ids = [...new Set((data ?? []).map((item) => item.user_id))];
    const { data: profiles } = ids.length ? await supabase.from("profiles").select("id,display_name").in("id", ids) : { data: [] };
    const names = new Map((profiles ?? []).map((item) => [item.id, item.display_name]));
    return NextResponse.json({ comments: (data ?? []).map((item) => ({ id: item.id, userId: item.user_id, displayName: names.get(item.user_id) ?? "成員", body: item.body, createdAt: item.created_at, updatedAt: item.updated_at })) });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 500, auth ? "UNAUTHENTICATED" : "COMMENTS_READ_FAILED", auth ? "請先登入" : "無法讀取留言");
  }
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase, user } = await requireUser(request);
    const body = text((await request.json() as { body?: unknown }).body, 1000);
    if (!body) return jsonError(400, "COMMENT_INVALID", "請輸入留言");
    const { data, error } = await supabase.from("calendar_event_comments").insert({ event_id: id, user_id: user.id, body }).select("id,user_id,body,created_at,updated_at").single();
    if (error || !data) return jsonError(403, "COMMENT_FORBIDDEN", "你不是此日曆的成員");
    return NextResponse.json({ comment: { id: data.id, userId: data.user_id, body: data.body, createdAt: data.created_at, updatedAt: data.updated_at } }, { status: 201 });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 422, auth ? "UNAUTHENTICATED" : "COMMENT_CREATE_FAILED", auth ? "請先登入" : "無法新增留言");
  }
}
