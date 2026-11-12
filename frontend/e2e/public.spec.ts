import { expect, test } from "@playwright/test";

import { login, visible } from "./helpers";

test.describe("public pages", () => {
  test("landing shows branding and featured courses", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse courses" }).first()).toBeVisible();
    await expect(page.getByText("Foundations of Aqeedah").first()).toBeVisible();
  });

  test("catalog lists published courses and filters by price", async ({ page }) => {
    await page.goto("/courses");
    await expect(page.getByRole("heading", { name: "Seerah Essentials" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tafsir of Juz Amma" })).toHaveCount(0); // draft
    await page.goto("/courses?price=free");
    await expect(page.getByRole("heading", { name: "Seerah Essentials" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Foundations of Aqeedah" })).toHaveCount(0);
  });

  test("course detail shows price, curriculum and a sign-in CTA for visitors", async ({ page }) => {
    await page.goto("/courses/foundations-of-aqeedah");
    await expect(page.getByRole("heading", { name: "Foundations of Aqeedah" })).toBeVisible();
    await expect(visible(page.getByText(/5,000/))).toBeVisible();
    await expect(page.getByRole("heading", { name: "Curriculum" })).toBeVisible();
    await expect(visible(page.getByRole("link", { name: /sign in to enroll/i }))).toBeVisible();
  });

  test("static pages and 404", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Privacy policy" })).toBeVisible();
    const res = await page.goto("/this-page-does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByText(/doesn.t exist/i)).toBeVisible();
  });

  test("certificate verification: valid and not found", async ({ page }) => {
    await login(page, "student.graduate@hikmah.test");
    const certs = (await (await page.request.get("/api/v1/me/certificates")).json()) as { code: string }[];
    const code = certs[0].code;
    await page.goto(`/verify/${code}`);
    await expect(page.getByText(/valid certificate/i)).toBeVisible();
    await expect(page.getByText("Ibrahim Siddiqui")).toBeVisible();
    await expect(page.getByText("Seerah Essentials")).toBeVisible();
    await page.goto("/verify/HKM-NOPE-NOPE");
    await expect(page.getByText(/couldn.t find/i)).toBeVisible();
  });

  test("security headers are set on pages", async ({ page }) => {
    const res = await page.goto("/");
    const headers = res!.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-/);
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });
});
