import { describe, expect, it } from "vitest";

import { safeNext, withNext } from "@/components/auth/safe-next";

describe("safeNext", () => {
  it("keeps same-origin relative paths with query and hash", () => {
    expect(safeNext("/courses/seerah-essentials")).toBe("/courses/seerah-essentials");
    expect(safeNext("/complete-profile?next=%2Fcourses%2Fx")).toBe("/complete-profile?next=%2Fcourses%2Fx");
    expect(safeNext("/learn/x#lesson")).toBe("/learn/x#lesson");
  });

  it("falls back for missing or empty values", () => {
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
    expect(safeNext("", "/home")).toBe("/home");
  });

  it.each([
    "https://evil.example/phish",
    "http://evil.example",
    "//evil.example",
    "///evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "evil.example",
    "courses",
    "/\t/evil.example",
    "/\n/evil.example",
    " //evil.example",
  ])("rejects off-site or unsafe target %j", (value) => {
    expect(safeNext(value)).toBe("/dashboard");
  });

  it("normalises dot segments without leaving the origin", () => {
    expect(safeNext("/../../etc")).toBe("/etc");
    expect(safeNext("/./courses")).toBe("/courses");
  });
});

describe("withNext", () => {
  it("appends an encoded, sanitised next", () => {
    expect(withNext("/login", "/courses/x")).toBe("/login?next=%2Fcourses%2Fx");
  });
  it("drops an unsafe next", () => {
    expect(withNext("/login", "https://evil.example")).toBe("/login");
    expect(withNext("/login", null)).toBe("/login");
  });
});
