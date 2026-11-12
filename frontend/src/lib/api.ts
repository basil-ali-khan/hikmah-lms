/**
 * Browser API client. Same-origin requests (Next proxies /api and /_allauth to Django),
 * session cookie auth, CSRF header on every write. Never stores tokens in localStorage.
 */

export class ApiError extends Error {
  status: number;
  code: string;
  fieldErrors: Record<string, string[]>;

  constructor(status: number, message: string, code = "error", fieldErrors: Record<string, string[]> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

let csrfReady: Promise<void> | null = null;
export function ensureCsrf(): Promise<void> {
  if (readCookie("csrftoken")) return Promise.resolve();
  csrfReady ??= fetch("/api/v1/csrf", { credentials: "include" }).then(() => undefined);
  return csrfReady;
}

type Body = Record<string, unknown> | FormData | undefined;

async function parseError(res: Response): Promise<ApiError> {
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }
  // allauth headless format: { errors: [{ message, code, param }] }
  if (Array.isArray(data.errors)) {
    const fieldErrors: Record<string, string[]> = {};
    for (const e of data.errors as { message: string; param?: string; code?: string }[]) {
      const key = e.param ?? "__all__";
      (fieldErrors[key] ??= []).push(e.message);
    }
    const first = (data.errors as { message: string; code?: string }[])[0];
    return new ApiError(res.status, first?.message ?? "Something went wrong.", first?.code ?? "error", fieldErrors);
  }
  if (res.status === 429) {
    return new ApiError(429, "Too many attempts. Please wait a minute and try again.", "rate_limited");
  }
  // DRF / our services: { detail, code, errors? }
  const fieldErrors = (data.errors as Record<string, string[]>) ?? {};
  const message =
    (data.detail as string) ??
    (res.status === 403 ? "You don't have access to this." : res.status === 404 ? "Not found." : "Something went wrong.");
  return new ApiError(res.status, message, (data.code as string) ?? String(res.status), fieldErrors);
}

export async function request<T = unknown>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: Body,
  init: { headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...init.headers };
  if (method !== "GET") {
    await ensureCsrf();
    headers["X-CSRFToken"] = readCookie("csrftoken") ?? "";
  }
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, { method, headers, body: payload, credentials: "include", signal: init.signal });
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("json") ? res.json() : res.text()) as Promise<T>;
}

export const api = {
  get: <T>(path: string, init?: { signal?: AbortSignal }) => request<T>("GET", path, undefined, init),
  post: <T>(path: string, body?: Body) => request<T>("POST", path, body),
  put: <T>(path: string, body?: Body) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: Body) => request<T>("PATCH", path, body),
  del: <T>(path: string, body?: Body) => request<T>("DELETE", path, body),
};

/** Opens a short-lived signed file URL returned by endpoints like /lessons/:id/file. */
export async function openSignedFile(path: string, newTab = true) {
  const { url } = await api.get<{ url: string }>(path);
  if (newTab) window.open(url, "_blank", "noopener,noreferrer");
  else window.location.href = url;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}
