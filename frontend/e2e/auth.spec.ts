import { expect, test } from "@playwright/test";

import { SEED_PASSWORD, latestEmail, login, uniqueEmail, visible } from "./helpers";

test.describe("sign-up, verification and profile", () => {
  test("new student signs up, verifies email from the inbox and completes the profile", async ({ page }) => {
    const email = uniqueEmail("signup");
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Sumayyah Rahman");
    await page.getByLabel("Email").fill(email);
    await page.locator('input[type="password"]').first().fill("Strong-Signup-Pass-2026");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/verify-email/);
    await expect(visible(page.getByText(/check your inbox/i))).toBeVisible();

    const mail = await latestEmail(email, "Confirm your email");
    const link = /https?:\/\/[^\s)"]+\/verify-email\/[^\s)"]+/.exec(mail.Text)![0];
    await page.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await expect(page.getByText(/email verified/i)).toBeVisible();

    await page.goto("/complete-profile");
    await page.getByLabel(/phone/i).fill("+44 7700 900456");
    await page.getByLabel(/date of birth/i).fill("1997-04-12");
    await page.getByLabel(/gender/i).selectOption("Female");
    await page.getByLabel(/country/i).selectOption("GB");
    await page.getByLabel(/city/i).fill("Manchester");
    const consent = page.getByRole("checkbox", { name: /consent/i });
    if (await consent.count()) await consent.check();
    await page.getByRole("button", { name: /save and continue/i }).click();
    await expect(page).toHaveURL(/dashboard/);
    await expect(visible(page.getByText(/Assalamu alaikum, Sumayyah/))).toBeVisible();
  });

  test("terms must be accepted", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("No Terms");
    await page.getByLabel("Email").fill(uniqueEmail("noterms"));
    await page.locator('input[type="password"]').first().fill("Strong-Signup-Pass-2026");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/signup/);
  });

  test("wrong password shows a generic error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("student.active@hikmah.test");
    await page.getByLabel("Password", { exact: true }).fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(/login/);
  });

  test("forgot password never reveals whether an account exists", async ({ page }) => {
    for (const email of ["student.active@hikmah.test", "nobody-here@hikmah.test"]) {
      await page.goto("/forgot-password");
      await page.getByLabel("Email").fill(email);
      await page.getByRole("button", { name: /send reset link/i }).click();
      await expect(page.getByText(/if an account exists/i)).toBeVisible();
    }
  });

  test("incomplete profile is sent to complete-profile; protected pages need sign-in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login\?next=/);
    await login(page, "student.new@hikmah.test", SEED_PASSWORD);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/complete-profile/);
  });

  test("open redirects are refused", async ({ page }) => {
    await login(page, "student.active@hikmah.test", SEED_PASSWORD, "https://evil.example.com/");
    await expect(page).toHaveURL(/localhost:3000/);
  });
});
