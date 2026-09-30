import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { color, text } from "@/lib/server/productivity";
import { jsonError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const { data, error } = await supabase.from("subjects").select("id,name,color,archived_at,version,created_at").eq("user_id", user.id).order("created_at");
    if (error) return jsonError(500, "SUBJECTS_READ_FAILED", "無法讀取科目", true);
    return NextResponse.json({ subjects: (data ?? []).map((item) => ({ id: item.id, name: item.name, color: item.color, archivedAt: item.archived_at, version: String(item.version) })) });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 500, auth ? "UNAUTHENTICATED" : "SUBJECTS_READ_FAILED", auth ? "請先登入" : "無法讀取科目");
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const body = await request.json() as Record<string, unknown>;
    const name = text(body.name, 80);
    if (!name) return jsonError(400, "SUBJECT_NAME_INVALID", "請輸入科目名稱");
    const { data, error } = await supabase.from("subjects").insert({ user_id: user.id, name, color: color(body.color) }).select("id,name,color,archived_at,version").single();
    if (error || !data) return jsonError(409, "SUBJECT_CREATE_FAILED", "無法建立科目", true);
    return NextResponse.json({ subject: { id: data.id, name: data.name, color: data.color, archivedAt: data.archived_at, version: String(data.version) } }, { status: 201 });
  } catch (error) {
    const auth = error instanceof Error && error.message === "UNAUTHENTICATED";
    return jsonError(auth ? 401 : 422, auth ? "UNAUTHENTICATED" : "SUBJECT_CREATE_FAILED", auth ? "請先登入" : "科目資料無效");
  }
}
