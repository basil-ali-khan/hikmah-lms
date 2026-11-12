import { expect, test } from "@playwright/test";

import { ADMIN, PNG, createStudent, login, staffLogin, visible } from "./helpers";

test.describe("enrollment & bank-slip payments", () => {
  test("free instant course: enroll and start learning", async ({ page }) => {
    await login(page, createStudent());
    await page.goto("/courses/seerah-essentials");
    await visible(page.getByRole("button", { name: /enroll/i })).click();
    await expect(page.getByText(/you.re enrolled/i)).toBeVisible();
    await page.getByRole("link", { name: /start learning/i }).first().click();
    await expect(page).toHaveURL(/\/learn\/seerah-essentials/);
  });

  test("approval course: request is pending until approved", async ({ page }) => {
    await login(page, createStudent());
    await page.goto("/courses/fiqh-of-worship");
    await visible(page.getByRole("button", { name: /request to join|enroll/i })).click();
    await expect(visible(page.getByText(/awaiting approval|request sent/i))).toBeVisible();
  });

  test("eligibility: women-only course is closed to a male profile", async ({ page }) => {
    await login(page, createStudent({ gender: "Male" }));
    await page.goto("/courses/sisters-tafsir-circle");
    await expect(visible(page.getByText(/not open to your profile/i))).toBeVisible();
  });

  test("paid course: receipt upload keeps content locked until the manager approves", async ({ page, browser }) => {
    const email = createStudent({ name: "Paying Student" });
    await login(page, email);
    await page.goto("/courses/foundations-of-aqeedah");
    await visible(page.getByRole("button", { name: /enroll/i })).click();
    await expect(page).toHaveURL(/\/payments\//);
    await expect(page.getByText(/HKM-/).first()).toBeVisible(); // payment reference
    await expect(page.getByText(/Meezan Bank/).first()).toBeVisible();

    await page.locator('input[type="file"]').last().setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
    await page.getByLabel(/transaction reference/i).fill("E2E-TX-1");
    await page.getByRole("button", { name: /submit for verification/i }).click();
    await expect(page.getByText(/being verified|pending/i).first()).toBeVisible();

    // Content still locked
    const locked = await page.request.get("/api/v1/learn/foundations-of-aqeedah");
    expect(locked.status()).toBe(403);

    // Manager approves in the staff panel
    const staff = await browser.newPage();
    await staffLogin(staff, "manager@hikmah.test");
    await staff.goto(`${ADMIN}/payments/paymentsubmission/?q=${encodeURIComponent(email)}`);
    await staff.locator("table tbody a").first().click();
    await staff.locator('select[name="decision"]').selectOption("approve");
    await staff.locator('textarea[name="decision_remarks"]').fill("Matched bank statement");
    await staff.locator('button[type="submit"][name="_save"], input[name="_save"]').first().click();
    await expect(staff.getByText(/payment approved/i)).toBeVisible();
    await staff.close();

    await page.reload();
    await expect(page.getByText(/approved/i).first()).toBeVisible();
    await page.goto("/learn/foundations-of-aqeedah");
    await expect(visible(page.getByText("Introduction to Aqeedah"))).toBeVisible();
  });

  test("resubmission requested: student sees the remark and can upload again", async ({ page }) => {
    await login(page, "student.rejected@hikmah.test");
    await page.goto("/payments");
    await page.getByText("Foundations of Aqeedah").first().click();
    await expect(page.getByText(/aren.t readable/i)).toBeVisible();
    await expect(page.locator('input[type="file"]').first()).toBeAttached();
  });

  test("pending payment is shown on the dashboard", async ({ page }) => {
    await login(page, "student.pending@hikmah.test");
    await page.goto("/dashboard");
    await expect(page.getByText(/being verified/i)).toBeVisible();
  });
});
