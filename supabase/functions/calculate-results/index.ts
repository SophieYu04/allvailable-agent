import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scoreCandidates } from "../_shared/scoring.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthenticated" }, 401);
  const service = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey);
  let callerId: string | null = null;
  if (token === serviceKey) callerId = "service-role";
  else {
    const authClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: auth } = await authClient.auth.getUser(); callerId = auth.user?.id ?? null;
  }
  if (!callerId) return json({ error: "unauthenticated" }, 401);
  const supabase = service;
  const { gatheringId } = await request.json();
  if (!gatheringId) return new Response(JSON.stringify({ error: "gatheringId is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { data: gathering, error } = await supabase.from("gatherings").select("*").eq("id", gatheringId).single();
  if (error || !gathering) return new Response(JSON.stringify({ error: "Gathering not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (callerId !== "service-role" && gathering.host_id !== callerId) return json({ error: "host_required" }, 403);
  const { data: memberships } = await supabase.from("memberships").select("user_id, display_name, is_priority, status").eq("gathering_id", gatheringId).eq("status", "joined");
  const { data: submissions } = await supabase.from("availability_submissions").select("user_id, cells").eq("gathering_id", gatheringId);

  if (['draft','finalized','cancelled'].includes(gathering.status)) return json({error:'GATHERING_LOCKED'},409);
  if (!memberships || !submissions) return json({error:'INPUT_READ_FAILED'},500);
  // Candidate generation and integer scoring live here in production so the client never decides a result.
  const excluded = new Set<string>(gathering.excluded_candidates ?? []);
  const manual = (gathering.manual_candidates ?? []).filter((c: { id: string; startsAt: string }) => !excluded.has(c.id) && new Date(c.startsAt) > new Date());
  const candidates = [...new Map([...buildCandidates(gathering), ...manual].filter(c => !excluded.has(c.id)).map(c => [c.id,c])).values()];
  const activeMembers = (memberships ?? []).filter((member) => member.status === "joined");
  const submissionMap = new Map((submissions ?? []).map((submission) => [submission.user_id, submission.cells ?? {}]));
  const scoreValue = (value: unknown): 0 | 1 | 2 => value === "green" ? 2 : value === "yellow" ? 1 : 0;
  const submissionsForScoring = activeMembers.map((member) => {
    const raw = submissionMap.get(member.user_id);
    return { participantId: member.user_id, displayName: member.display_name ?? "", isPriority: member.is_priority, submitted: raw !== undefined, active: true, statuses: raw as Record<string, string> | undefined, slots: Object.fromEntries(Object.entries(raw ?? {}).map(([cell, value]) => [cell, scoreValue(value)])) };
  });
  const cellsByCandidate = Object.fromEntries(candidates.map((candidate) => [candidate.id, candidateCells(candidate)]));
  const recommendationCount = Math.min(3, Math.max(1, Number(gathering.recommendation_count) || 3));
  const ranked = scoreCandidates(candidates, submissionsForScoring, cellsByCandidate);
  const manualIds = new Set(manual.map((c: {id:string}) => c.id));
  const included = [...ranked.filter(c => manualIds.has(c.id)), ...ranked.filter(c => !manualIds.has(c.id))].slice(0,recommendationCount);
  const scored = ranked.filter(c => included.some(i => i.id === c.id));
  const { data: inserted, error: snapshotError } = await supabase.rpc("commit_gathering_snapshot", {
    p_gathering_id: gatheringId, p_revision: String(gathering.revision), p_criteria: { recommendationCount },
    p_candidates: scored, p_members: activeMembers.map((member) => member.user_id),
  });
  if (snapshotError) return json({ error: "STALE_OR_LOCKED_RESULT" }, 409);
  return json({ snapshot: inserted });
});

function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

function candidateCells(candidate: { startsAt: string; endsAt: string }) {
  const start = new Date(candidate.startsAt).getTime(); const end = new Date(candidate.endsAt).getTime(); const cells: string[] = [];
  for (let cursor = start; cursor < end; cursor += 30 * 60_000) { const dateParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(cursor)); const date = `${dateParts.find((part) => part.type === "year")?.value}-${dateParts.find((part) => part.type === "month")?.value}-${dateParts.find((part) => part.type === "day")?.value}`; const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(cursor)); const hour = parts.find((part) => part.type === "hour")?.value ?? "00"; const minute = parts.find((part) => part.type === "minute")?.value ?? "00"; cells.push(`${date}-${hour}:${minute}`); }
  return cells;
}

function buildCandidates(gathering: { date_start: string; date_end: string; daily_start: string; daily_end: string; duration_minutes: number }) {
  const candidates: Array<{ id: string; startsAt: string; endsAt: string }> = [];
  let start = parseTaipei(gathering.date_start, gathering.daily_start);
  while (taipeiDate(start) <= gathering.date_end) {
    const localDate = taipeiDate(start);
    const dayEnd = parseTaipei(localDate, gathering.daily_end);
    const candidateEnd = new Date(start.getTime() + gathering.duration_minutes * 60_000);
    if (candidateEnd <= dayEnd && start > new Date()) candidates.push({ id: start.toISOString(), startsAt: start.toISOString(), endsAt: candidateEnd.toISOString() });
    const next = new Date(start.getTime() + 30 * 60_000);
    start = next < dayEnd ? next : parseTaipei(addTaipeiDay(localDate), gathering.daily_start);
  }
  return candidates;
}

function parseTaipei(date: string, time: string) {
  const normalized = String(time).slice(0, 5);
  if (normalized === "24:00") return new Date(`${addTaipeiDay(date)}T00:00:00+08:00`);
  return new Date(`${date}T${normalized}:00+08:00`);
}

function taipeiDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}

function addTaipeiDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
