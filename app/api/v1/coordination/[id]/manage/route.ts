import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { gatheringInputSchema } from "@/lib/server/gatherings";
import { jsonError } from "@/lib/server/http";

const inputSchema = z.object({
  expectedRevision: z.string().regex(/^\d+$/),
  idempotencyKey: z.string().uuid(),
  action: z.enum(["publish", "settings", "leave", "reopen", "add-candidate", "remove-candidate"]),
  input: z.record(z.unknown()).default({}),
});
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireUser(request);
    const body = inputSchema.parse(await request.json());
    const { id } = await context.params;
    let input = body.input;
    if (body.action === "settings") input = gatheringInputSchema.parse(input);
    if (body.action === "reopen") input = z.object({ deadline: z.string().datetime({ offset: true }) }).parse(input);
    if (body.action.endsWith("candidate")) input = z.object({ startsAt: z.string().datetime({ offset: true }) }).parse(input);
    const { data, error } = await supabase.rpc("manage_gathering", {
      p_id: id, p_version: body.expectedRevision, p_key: body.idempotencyKey, p_action: body.action, p_input: input,
    });
    if (error) {
      const code = ["HOST_REQUIRED","NOT_MEMBER","GATHERING_NOT_FOUND","VERSION_CONFLICT","IDEMPOTENCY_CONFLICT","GATHERING_LOCKED","GATHERING_FULL","MAX_CANDIDATES","CANDIDATE_INVALID","GATHERING_INVALID","INVALID_PRIORITY"].find(code => error.message.includes(code)) ?? "MANAGEMENT_FAILED";
      return jsonError(code === "HOST_REQUIRED" || code === "NOT_MEMBER" ? 403 : code === "GATHERING_NOT_FOUND" ? 404 : code.endsWith("CONFLICT") || code === "GATHERING_LOCKED" ? 409 : 400, code, code.replaceAll("_", " ").toLowerCase(), true);
    }
    return NextResponse.json({ gathering: data });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(400, "INVALID_INPUT", error.issues[0]?.message ?? "Invalid input");
    return jsonError(401, "UNAUTHENTICATED", "Please sign in");
  }
}
