import { type Locator, type Page, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const BACKEND = path.resolve(__dirname, "../../backend");
export const API = process.env.E2E_API_URL ?? "http://localhost:8000";
export const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://localhost:8025";
export const ADMIN = `${API}/${process.env.E2E_ADMIN_PATH ?? "staff-panel"}`;

/** Dev seed password, read from the seed file (never hardcoded here). */
export const SEED_PASSWORD = (() => {
  const yaml = readFileSync(path.join(BACKEND, "seed/dev_users.yaml"), "utf8");
  return /^password:\s*"([^"]+)"/m.exec(yaml)![1];
})();

export function manage(...args: string[]) {
  return execFileSync("uv", ["run", "python", "manage.py", ...args], { cwd: BACKEND, encoding: "utf8" }).trim();
}

export function uniqueEmail(prefix = "e2e") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@hikmah.test`;
}

export function createStudent(
  opts: { unverified?: boolean; incomplete?: boolean; gender?: string; name?: string; enroll?: string[] } = {},
) {
  const email = uniqueEmail();
  const args = ["e2e_user", "--email", email, "--password", SEED_PASSWORD, "--name", opts.name ?? "E2E Student"];
  if (opts.unverified) args.push("--unverified");
  if (opts.incomplete) args.push("--incomplete");
  if (opts.gender) args.push("--gender", opts.gender);
  for (const slug of opts.enroll ?? []) args.push("--enroll", slug);
  manage(...args);
  return email;
}

export async function login(page: Page, email: string, password = SEED_PASSWORD, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Staff panel sign-in goes through allauth's server-rendered login (2FA is off in dev .env). */
export async function staffLogin(page: Page, email: string) {
  await page.goto(`${ADMIN}/`);
  await page.locator('input[name="login"], input[name="email"]').first().fill(email);
  await page.locator('input[name="password"]').fill(SEED_PASSWORD);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  await expect(page).toHaveURL(new RegExp(`${ADMIN}/`));
}

/** Newest email to an address from Mailpit's API. */
export async function latestEmail(to: string, subjectIncludes?: string) {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const data = (await res.json()) as { messages: { ID: string; Subject: string }[] };
    const msg = data.messages.find((m) => !subjectIncludes || m.Subject.includes(subjectIncludes));
    if (msg) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as { Text: string; HTML: string; Subject: string };
      return full;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email to ${to}${subjectIncludes ? ` with subject containing "${subjectIncludes}"` : ""}`);
}

/** The visible match only (pages mount phone + desktop variants of some controls and hide one with CSS). */
export const visible = (l: Locator) => l.filter({ visible: true }).first();

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

/** A 1x1 PNG is enough for receipt uploads (the server sniffs real image bytes). */
export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
