/** django-allauth headless (browser client) calls. Session cookie based. */
import { ApiError, api, ensureCsrf } from "./api";

const BASE = "/_allauth/browser/v1";

export type AuthFlow = { id: string; is_pending?: boolean };
export type AuthResponse = {
  status: number;
  data?: { user?: { id: string; email: string; display: string }; flows?: AuthFlow[]; email?: string };
  meta?: { is_authenticated?: boolean };
};

/** allauth answers 401 with useful flow info (e.g. pending email verification); treat it as data. */
async function call(method: "GET" | "POST" | "DELETE" | "PUT", path: string, body?: Record<string, unknown>) {
  try {
    return await (method === "GET"
      ? api.get<AuthResponse>(BASE + path)
      : method === "POST"
        ? api.post<AuthResponse>(BASE + path, body)
        : method === "PUT"
          ? api.put<AuthResponse>(BASE + path, body)
          : api.del<AuthResponse>(BASE + path, body));
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && !Object.keys(e.fieldErrors).length) {
      return { status: 401, meta: { is_authenticated: false } } as AuthResponse;
    }
    throw e;
  }
}

export const auth = {
  session: () => call("GET", "/auth/session"),
  login: (email: string, password: string) => call("POST", "/auth/login", { email, password }),
  signup: (body: { email: string; password: string; full_name: string; accept_terms: boolean; turnstile_token?: string }) =>
    call("POST", "/auth/signup", body),
  logout: () => call("DELETE", "/auth/session"),
  verifyEmail: (key: string) => call("POST", "/auth/email/verify", { key }),
  verifyEmailInfo: (key: string) =>
    fetch(`${BASE}/auth/email/verify`, { headers: { "X-Email-Verification-Key": key }, credentials: "include" }).then(
      (r) => r.json() as Promise<AuthResponse>,
    ),
  resendVerification: (email: string) => call("PUT", "/account/email", { email }),
  requestPasswordReset: (email: string) => call("POST", "/auth/password/request", { email }),
  resetPassword: (key: string, password: string) => call("POST", "/auth/password/reset", { key, password }),
  changePassword: (current_password: string, new_password: string) =>
    call("POST", "/account/password/change", { current_password, new_password }),
  sessions: () => api.get<{ data: { id: number; ip: string; user_agent: string; last_seen_at: number; is_current: boolean }[] }>(
    `${BASE}/auth/sessions`,
  ),
  endSessions: (sessions: number[]) => call("DELETE", "/auth/sessions", { sessions }),
};

/** Google sign-in is a full-page form POST (allauth redirects to Google and back). */
export async function startGoogleLogin(next = "/dashboard") {
  await ensureCsrf();
  const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrftoken="))?.split("=")[1] ?? "";
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `${BASE}/auth/provider/redirect`;
  const fields: Record<string, string> = {
    provider: "google",
    process: "login",
    callback_url: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
    csrfmiddlewaretoken: decodeURIComponent(csrf),
  };
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
