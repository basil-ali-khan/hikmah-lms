import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JoinButton, effectiveJoinState } from "@/components/learn/join-button";
import { Providers } from "@/components/providers";
import type { SiteConfig } from "@/lib/types";

const post = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, post: (...args: unknown[]) => post(...args) } };
});

const site = {
  institute_name: "Test Institute",
  institute_timezone: "Asia/Karachi",
  join_window_minutes: 15,
  flags: { pwa_install_prompt: false },
} as unknown as SiteConfig;

const iso = (offsetMin: number) => new Date(Date.now() + offsetMin * 60_000).toISOString();

function renderButton(session: Parameters<typeof JoinButton>[0]["session"]) {
  return render(
    <Providers site={site}>
      <JoinButton session={session} />
    </Providers>,
  );
}

describe("JoinButton", () => {
  beforeEach(() => {
    post.mockReset();
    vi.spyOn(window, "open").mockImplementation(() => null);
  });
  afterEach(() => vi.restoreAllMocks());

  it("is disabled with the opening time while the class is upcoming", () => {
    renderButton({ id: "s1", title: "Session 6", join_state: "upcoming", starts_at: iso(120), ends_at: iso(210) });
    const button = screen.getByRole("button", { name: /Join opens 15 min before start/ });
    expect(button).toBeDisabled();
  });

  it("calls the join endpoint and opens the meeting link when open", async () => {
    post.mockResolvedValue({ join_url: "https://meet.example.com/abc" });
    renderButton({ id: "s2", title: "Session 5", join_state: "open", starts_at: iso(5), ends_at: iso(95) });
    await userEvent.click(screen.getByRole("button", { name: /Join class/ }));
    expect(post).toHaveBeenCalledWith("/api/v1/live/s2/join");
    await waitFor(() => expect(window.open).toHaveBeenCalledWith("https://meet.example.com/abc", "_blank", "noopener"));
  });

  it("renders nothing once the class has ended", () => {
    renderButton({ id: "s3", title: "Old", join_state: "ended", starts_at: iso(-200), ends_at: iso(-110) });
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("effectiveJoinState", () => {
  const now = Date.parse("2026-11-11T10:00:00Z");
  it("opens locally once inside the join window", () => {
    const s = { join_state: "upcoming" as const, starts_at: "2026-11-11T10:10:00Z", ends_at: "2026-11-11T11:40:00Z" };
    expect(effectiveJoinState(s, now, 15)).toBe("open");
    expect(effectiveJoinState(s, now, 5)).toBe("upcoming");
  });
  it("falls back to the server state when the clock is unknown", () => {
    const s = { join_state: "upcoming" as const, starts_at: "2026-11-11T10:10:00Z", ends_at: "2026-11-11T11:40:00Z" };
    expect(effectiveJoinState(s, 0, 15)).toBe("upcoming");
  });
});
