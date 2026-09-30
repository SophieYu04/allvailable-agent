import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("zone") || "UTC";
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC", "Asia/Taipei"];
  const zone = zones.includes(requested) || requested === "UTC" ? requested : "UTC";
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, timeZoneName: "longOffset", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  return NextResponse.json({ zone, now: now.toISOString(), label: parts.find((part) => part.type === "timeZoneName")?.value || "GMT", zones });
}
