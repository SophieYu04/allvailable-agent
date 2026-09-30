import { NextResponse } from "next/server";

export function jsonError(status: number, code: string, message: string, retryable = false, requestId = crypto.randomUUID()) {
  return NextResponse.json({ error: { code, message, retryable }, requestId }, { status });
}

export function requestId(request: Request) { return request.headers.get("x-request-id") ?? crypto.randomUUID(); }

export function decimalVersion(value: unknown) {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  if (!/^\d+$/.test(text)) throw new Error("VERSION_INVALID");
  return text;
}

export function nextDecimalVersion(value: unknown) {
  return (BigInt(decimalVersion(value)) + BigInt(1)).toString();
}
