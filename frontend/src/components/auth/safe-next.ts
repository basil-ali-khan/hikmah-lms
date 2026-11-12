/**
 * Sanitises a `?next=` redirect target. Only same-origin relative paths ("/courses/x?tab=1") are allowed;
 * anything that could leave the site (absolute URLs, protocol-relative "//host", backslash tricks,
 * javascript: URLs, control characters) falls back to the default.
 */
export function safeNext(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim();
  if (!value.startsWith("/")) return fallback;
  // "//evil.com" and "/\evil.com" are treated as protocol-relative by browsers.
  if (value.startsWith("//") || value.includes("\\")) return fallback;
  // Control characters / whitespace can be stripped by browsers to form "//".
  if (/[\u0000-\u001F\u007F\s]/.test(value)) return fallback;
  try {
    const base = "https://same-origin.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/** Builds "/login?next=..." style links with a sanitised next. */
export function withNext(path: string, next: string | null | undefined): string {
  const safe = safeNext(next, "");
  return safe ? `${path}?next=${encodeURIComponent(safe)}` : path;
}
