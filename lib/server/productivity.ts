export const colors = ["sage", "blue", "peach", "lilac", "rose", "amber"] as const;
export type ProductColor = (typeof colors)[number];

export function text(value: unknown, max: number) {
  const result = typeof value === "string" ? value.trim() : "";
  return result.length > 0 && result.length <= max ? result : null;
}

export function email(value: unknown) {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) && result.length <= 320 ? result : null;
}

export function color(value: unknown): ProductColor {
  return colors.includes(value as ProductColor) ? value as ProductColor : "blue";
}

export function dateOnly(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

export function instant(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function taipeiToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function dbError(error: unknown, fallback: string) {
  return error && typeof error === "object" && "message" in error ? String(error.message) : fallback;
}
