import { expect, test } from "@playwright/test";

import { ADMIN, login, staffLogin } from "./helpers";

test.describe("staff panel rules and live settings", () => {
  test.skip(({ isMobile }) => isMobile, "staff panel flows run on desktop");

  test("instructor only sees assigned courses and no pricing fields", async ({ page }) => {
    await staffLogin(page, "instructor2@hikmah.test");
    await page.goto(`${ADMIN}/courses/course/`);
    await expect(page.getByText("Fiqh of Worship")).toBeVisible();
    await expect(page.getByText("Foundations of Aqeedah")).toHaveCount(0);
    await page.getByText("Fiqh of Worship").click();
    await expect(page.locator('input[name="price"]')).toHaveCount(0);
  });

  test("certificate revoke shows on the public verify page", async ({ page, browser }) => {
    const student = await browser.newPage();
    await login(student, "student.graduate@hikmah.test");
    const certs = (await (await student.request.get("/api/v1/me/certificates")).json()) as { code: string }[];
    await student.close();

    await staffLogin(page, "manager@hikmah.test");
    await page.goto(`${ADMIN}/certificates/certificate/?q=${certs[0].code}`);
    await page.getByRole("link", { name: certs[0].code }).click();
    await page.locator('input[name="revoke"]').check();
    await page.locator('textarea[name="reason"]').fill("E2E revocation test");
    await page.locator('button[name="_save"], input[name="_save"]').first().click();

    await page.goto(`http://localhost:3000/verify/${certs[0].code}`);
    await expect(page.getByText(/revoked/i).first()).toBeVisible();
  });

  test("branding change in Site Settings reaches the web app without a deploy", async ({ page }) => {
    await staffLogin(page, "superadmin@hikmah.test");
    await page.goto(`${ADMIN}/core/sitesettings/`);
    await page.locator('input[name="color_primary"]').fill("#0B5D3B");
    await page.locator('button[name="_save"], input[name="_save"]').first().click();
    await expect(page.locator(".messagelist, [role=alert], .bg-green-100").first()).toBeVisible();

    await expect
      .poll(async () => {
        await page.goto("http://localhost:3000/");
        return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--brand-primary").trim());
      }, { timeout: 90_000, intervals: [5_000] })
      .toBe("#0B5D3B");

    // restore
    await page.goto(`${ADMIN}/core/sitesettings/`);
    await page.locator('input[name="color_primary"]').fill("#003399");
    await page.locator('button[name="_save"], input[name="_save"]').first().click();
  });

  test("admin added profile field appears on the sign-up profile form", async ({ page }) => {
    await staffLogin(page, "superadmin@hikmah.test");
    await page.goto(`${ADMIN}/accounts/profilefielddefinition/add/`);
    await page.locator('input[name="label"]').fill("Madhab");
    await page.locator('input[name="key"]').fill("madhab");
    await page.locator('select[name="field_type"]').selectOption("text");
    await page.locator('input[name="order"]').fill("50");
    await page.locator('button[name="_save"], input[name="_save"]').first().click();

    const res = await page.request.get("http://localhost:3000/api/v1/profile-fields");
    const fields = (await res.json()) as { key: string }[];
    expect(fields.map((f) => f.key)).toContain("madhab");
  });
});
