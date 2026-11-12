import { describe, expect, it } from "vitest";

import { accessLabel, money } from "@/lib/format";

describe("format", () => {
  it("formats money in the course currency", () => {
    expect(money("5000", "PKR")).toMatch(/5,000/);
    expect(money("40", "USD")).toBe("$40");
  });
  it("describes access rules", () => {
    expect(accessLabel({ access_type: "lifetime", access_days: null, access_until: null })).toBe("Lifetime access");
    expect(accessLabel({ access_type: "days", access_days: 90, access_until: null })).toBe("90 days of access");
  });
});
