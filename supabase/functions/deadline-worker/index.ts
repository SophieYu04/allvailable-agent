import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (request: Request) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  // Cron invokes this function with x-cron-secret; never leave the service-role path public.
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  await supabase.from("coordination_proposals").delete().lt("expires_at", new Date().toISOString());
  await supabase.from("coordination_transcripts").delete().lt("expires_at", new Date().toISOString());
  await supabase.from("calendar_imports").delete().lt("expires_at", new Date().toISOString());
  await supabase.from("calendar_import_previews").delete().lt("expires_at", new Date().toISOString());
  await supabase.from("calendar_link_transactions").delete().lt("expires_at", new Date().toISOString());
  const taipeiDateParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const taipeiToday = `${taipeiDateParts.find((part) => part.type === "year")?.value}-${taipeiDateParts.find((part) => part.type === "month")?.value}-${taipeiDateParts.find((part) => part.type === "day")?.value}`;
  await supabase.from("personal_busy_cells").delete().lt("local_date", taipeiToday);
  const { data: due } = await supabase.from("gatherings").select("id").eq("status", "open").lte("deadline_at", new Date().toISOString());
  const results = [];
  for (const gathering of due ?? []) {
    const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/calculate-results`, { method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify({ gatheringId: gathering.id }) });
    results.push({ id: gathering.id, ok: response.ok });
  }
  return new Response(JSON.stringify({ processed: results.length, results }), { headers: { "Content-Type": "application/json" } });
});
