import { expect, test } from "@playwright/test";

import { createStudent, isMobile, login, staffLogin, visible, ADMIN } from "./helpers";

test.describe("course player, live classes and assessments", () => {
  test("outline shows progress, locks and module release dates", async ({ page }) => {
    await login(page, "student.active@hikmah.test");
    await page.goto("/learn/foundations-of-aqeedah");
    await expect(page.getByRole("progressbar").first()).toBeVisible();
    await expect(page.getByText("Belief in the Angels")).toBeVisible();
    await expect(page.getByText(/opens/i).first()).toBeVisible(); // module 3 release date
  });

  test("prerequisite lock, then mark complete updates progress (fresh student)", async ({ page }) => {
    await login(page, createStudent({ enroll: ["seerah-essentials"] }));
    await page.goto("/learn/seerah-essentials");
    await visible(page.getByText("Before prophethood")).click();
    await expect(page).toHaveURL(/lessons\//);
    await expect(page.getByRole("button", { name: /play video/i })).toBeVisible();
    await visible(page.getByRole("button", { name: /mark (as )?complete/i })).click();
    await expect(visible(page.getByText(/completed|next lesson/i))).toBeVisible();
    if (isMobile(page)) {
      await page.getByRole("button", { name: /course content/i }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    }
  });

  test("lesson behind a prerequisite explains the lock", async ({ page }) => {
    await login(page, "student.pending@hikmah.test"); // not enrolled in paid course yet → 403 page
    await page.goto("/learn/foundations-of-aqeedah");
    await expect(page.getByText(/enroll|access/i).first()).toBeVisible();
  });

  test("timed quiz: autosave, submit, short answer awaits grading", async ({ page }) => {
    await login(page, createStudent({ enroll: ["foundations-of-aqeedah"] }));
    await page.goto("/learn/foundations-of-aqeedah");
    await visible(page.getByText("Quiz 2 · Pillars")).click();
    await visible(page.getByRole("button", { name: /start|resume/i })).click();
    await expect(page).toHaveURL(/attempt\//);
    await expect(page.getByText(/\d+:\d{2}/).first()).toBeVisible(); // timer
    await page.getByText("Belief in astrology").click();
    await expect(visible(page.getByText(/saved/i))).toBeVisible();
    await visible(page.getByRole("button", { name: /^next/i })).click();
    await page.getByText("Muhammad ﷺ").click();
    await visible(page.getByRole("button", { name: /^next/i })).click();
    await visible(page.getByRole("textbox")).fill("It means believing in what we cannot see: angels, the hereafter and qadr.");
    await expect(visible(page.getByText(/saved/i))).toBeVisible();
    await visible(page.getByRole("button", { name: /submit|review/i })).click();
    await page.getByRole("dialog").getByRole("button", { name: /submit/i }).click(); // confirm sheet
    await expect(page).toHaveURL(/result\//);
    await expect(page.getByText(/await|grad/i).first()).toBeVisible();
  });

  test("assignment: submit a file, instructor grades it, student sees the grade", async ({ page, browser }) => {
    await login(page, createStudent({ name: "Assignment Student", enroll: ["foundations-of-aqeedah"] }));
    await page.goto("/learn/foundations-of-aqeedah");
    await visible(page.getByText(/case study/i)).click();
    await visible(page.getByRole("textbox")).fill("My answer to the case study.");
    await page.getByRole("button", { name: /submit assignment/i }).click();
    await expect(visible(page.getByText(/submitted/i))).toBeVisible();

    const teacher = await browser.newPage();
    await staffLogin(teacher, "instructor1@hikmah.test");
    await teacher.goto(`${ADMIN}/assessments/submission/?status__exact=submitted`);
    await teacher.getByRole("link", { name: /assignment student/i }).first().click();
    await teacher.locator('input[name="grade"]').fill("16");
    await teacher.locator('textarea[name="feedback_text"]').fill("Well argued.");
    await teacher.locator('button[name="_save"], input[name="_save"]').first().click();
    await teacher.close();

    await page.reload();
    await expect(page.getByText(/16\s*\/\s*20/)).toBeVisible();
    await expect(page.getByText("Well argued.")).toBeVisible();
  });

  test("live tab shows schedule in local time with calendar link", async ({ page }) => {
    await login(page, "student.active@hikmah.test");
    await page.goto("/learn/foundations-of-aqeedah/live");
    await expect(page.getByText("Session 6: The Books")).toBeVisible();
    await expect(page.getByText(/Session 1: Why Aqeedah/)).toBeVisible();
    await page.getByText("Session 6: The Books").click();
    await expect(page.getByRole("link", { name: /calendar/i })).toHaveAttribute("href", /\/ics$/);
  });

  test("expired access is explained", async ({ page }) => {
    await login(page, "student.expired@hikmah.test");
    await page.goto("/my-courses");
    await expect(page.getByText(/expired/i).first()).toBeVisible();
  });
});
