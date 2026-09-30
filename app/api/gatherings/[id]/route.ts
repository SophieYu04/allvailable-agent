import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const { supabase } = await requireUser(request);
    const { data, error } = await supabase.rpc("read_gathering", { p_id: id });
    if (error || !data) return jsonError(404, "GATHERING_NOT_FOUND", "Invitation unavailable");
    return NextResponse.json({ gathering: data });
  } catch { return jsonError(401, "UNAUTHENTICATED", "請先登入"); }
}
