import "server-only";

import type { SiteConfig } from "./types";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export const FALLBACK_CONFIG: SiteConfig = {
  institute_name: "Hikmah Online",
  tagline: "",
  description: "",
  logo_url: null,
  favicon_url: null,
  colors: { primary: "#003399", accent: "#FFDF00", heading: "#34495E", text: "#1E1F25", surface: "#F2F2F2" },
  fonts: { heading: "Raleway", body: "Roboto" },
  support: { email: "", whatsapp: "" },
  social_links: {},
  institute_timezone: "Asia/Karachi",
  payment_review_eta: "1 working day",
  join_window_minutes: 15,
  max_upload_mb: 10,
  password_min_length: 10,
  default_refund_policy: "",
  flags: { google_login: false, turnstile: false, pwa_install_prompt: false, analytics: false, self_service_deletion: true },
  turnstile_site_key: "",
  footer_pages: [],
};

/** Server-side fetch of branding/flags. Short revalidation so admin edits show up within a minute. */
export async function getSiteConfig(): Promise<SiteConfig> {
  try {
    const res = await fetch(`${API_URL}/api/v1/site-config`, { next: { revalidate: 60 } });
    if (!res.ok) return FALLBACK_CONFIG;
    return (await res.json()) as SiteConfig;
  } catch {
    return FALLBACK_CONFIG;
  }
}

/** Server-side public API fetch (catalog, course pages, verify) for SEO-friendly rendering. */
export async function serverGet<T>(path: string, revalidate = 60): Promise<{ status: number; data: T | null }> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate } });
    return { status: res.status, data: res.ok ? ((await res.json()) as T) : null };
  } catch {
    return { status: 503, data: null };
  }
}
