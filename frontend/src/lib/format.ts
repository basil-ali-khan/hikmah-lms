/** Dates are stored in UTC by the API; we always render in the viewer's own time zone (with the zone named). */

export function userTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function tzName(date: Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "short" }).formatToParts(date);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}, timeZone?: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone, ...opts }).format(
    new Date(iso),
  );
}

/** "Tue 2 Dec · 2:00 PM GMT+5" in the viewer's zone (or a given zone). */
export function formatDateTime(iso: string | null | undefined, timeZone?: string, withZone = true) {
  if (!iso) return "";
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(d);
  return `${day} · ${time}${withZone ? ` ${tzName(d, timeZone)}` : ""}`;
}

export function formatTime(iso: string, timeZone?: string) {
  const d = new Date(iso);
  return `${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(d)} ${tzName(d, timeZone)}`;
}

export function dayHeading(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const label = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
  if (same(d, today)) return `Today · ${label}`;
  if (same(d, tomorrow)) return `Tomorrow · ${label}`;
  return label;
}

export function relativeTime(iso: string, now = Date.now()) {
  const diff = new Date(iso).getTime() - now;
  const mins = Math.round(diff / 60000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

export function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

export function money(amount: string | number, currency: string) {
  const value = typeof amount === "string" ? Number(amount) : amount;
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const courseTypeLabel = { live: "Live", recorded: "Recorded", hybrid: "Hybrid" } as const;

export function accessLabel(c: { access_type: string; access_days: number | null; access_until: string | null }) {
  if (c.access_type === "days" && c.access_days) return `${c.access_days} days of access`;
  if (c.access_type === "until" && c.access_until) return `Access until ${formatDate(c.access_until)}`;
  return "Lifetime access";
}
