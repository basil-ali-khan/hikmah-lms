import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({ put: vi.fn(), post: vi.fn(), get: vi.fn(), patch: vi.fn(), del: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), api: apiMock }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { QuizRunner } from "@/components/assess/quiz-runner";
import { useAutosave } from "@/components/assess/use-autosave";
import { ApiError } from "@/lib/api";
import type { Attempt } from "@/lib/types";

type Save = (attemptId: string, questionId: number, answer: { choice_ids: number[]; text: string }) => Promise<unknown>;
function setup(save: Save) {
  const onTerminal = vi.fn();
  const hook = renderHook(() => useAutosave({ attemptId: "att-1", onTerminal, save }));
  return { ...hook, onTerminal };
}

/** Let pending promise callbacks run under fake timers. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useAutosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves choice answers immediately", async () => {
    const save = vi.fn().mockResolvedValue({});
    const { result } = setup(save);

    act(() => result.current.saveNow(7, { choice_ids: [3], text: "" }));
    expect(save).toHaveBeenCalledWith("att-1", 7, { choice_ids: [3], text: "" });
    expect(result.current.state).toBe("saving");

    await settle();
    expect(result.current.state).toBe("saved");
    expect(result.current.savedAt).not.toBeNull();
  });

  it("debounces short-answer typing and sends only the latest text", async () => {
    const save = vi.fn().mockResolvedValue({});
    const { result } = setup(save);

    act(() => result.current.saveDebounced(9, { choice_ids: [], text: "H" }));
    act(() => vi.advanceTimersByTime(300));
    act(() => result.current.saveDebounced(9, { choice_ids: [], text: "He" }));
    act(() => vi.advanceTimersByTime(300));
    act(() => result.current.saveDebounced(9, { choice_ids: [], text: "Hello" }));
    expect(save).not.toHaveBeenCalled();
    expect(result.current.state).toBe("saving");

    act(() => vi.advanceTimersByTime(600));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("att-1", 9, { choice_ids: [], text: "Hello" });
    await settle();
    expect(result.current.state).toBe("saved");
  });

  it("retries failed saves with backoff and recovers", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new ApiError(503, "Service unavailable"))
      .mockResolvedValue({});
    const { result } = setup(save);

    act(() => result.current.saveNow(1, { choice_ids: [2], text: "" }));
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("error");
    expect(result.current.error).toMatch(/retrying/i);

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await settle();
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe("error");

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    await settle();
    expect(save).toHaveBeenCalledTimes(3);
    expect(save).toHaveBeenLastCalledWith("att-1", 1, { choice_ids: [2], text: "" });
    expect(result.current.state).toBe("saved");
    expect(result.current.error).toBeNull();
  });

  it("retries the newest value when an answer changed while offline", async () => {
    const save = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue({});
    const { result } = setup(save);

    act(() => result.current.saveNow(1, { choice_ids: [2], text: "" }));
    await settle();
    act(() => result.current.saveNow(1, { choice_ids: [4], text: "" }));
    await settle();
    expect(save).toHaveBeenLastCalledWith("att-1", 1, { choice_ids: [4], text: "" });

    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    await settle();
    // The stale value [2] is never re-sent after [4] succeeded.
    expect(save.mock.calls.filter((c) => (c[2] as { choice_ids: number[] }).choice_ids[0] === 2)).toHaveLength(1);
  });

  it("stops and reports time_up so the page can navigate to the result", async () => {
    const save = vi.fn().mockRejectedValue(new ApiError(400, "Time's up", "time_up"));
    const { result, onTerminal } = setup(save);

    act(() => result.current.saveNow(1, { choice_ids: [2], text: "" }));
    await settle();
    expect(onTerminal).toHaveBeenCalledWith("time_up", "Time's up");

    // No retries and no further saves after a terminal error.
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    act(() => result.current.saveNow(2, { choice_ids: [5], text: "" }));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("treats already_submitted as terminal too", async () => {
    const save = vi.fn().mockRejectedValue(new ApiError(400, "Already submitted", "already_submitted"));
    const { result, onTerminal } = setup(save);
    act(() => result.current.saveDebounced(3, { choice_ids: [], text: "x" }));
    act(() => vi.advanceTimersByTime(600));
    await settle();
    expect(onTerminal).toHaveBeenCalledWith("already_submitted", "Already submitted");
  });

  it("flush sends pending debounced text right away", async () => {
    const save = vi.fn().mockResolvedValue({});
    const { result } = setup(save);
    act(() => result.current.saveDebounced(3, { choice_ids: [], text: "draft" }));
    let ok = false;
    await act(async () => {
      ok = await result.current.flush();
    });
    expect(save).toHaveBeenCalledWith("att-1", 3, { choice_ids: [], text: "draft" });
    expect(ok).toBe(true);
  });
});

describe("QuizRunner autosave wiring", () => {
  const attempt: Attempt = {
    id: "att-9",
    number: 1,
    status: "in_progress",
    quiz: { id: "q1", title: "Quiz 2", course_slug: "c" },
    started_at: "2026-11-11T10:00:00Z",
    deadline_at: null,
    server_now: "2026-11-11T10:00:00Z",
    questions: [
      { id: 11, kind: "single", text: "Pick one", points: 1, choices: [{ id: 1, text: "A" }, { id: 2, text: "B" }], answer: null },
      { id: 12, kind: "short", text: "Explain", points: 2, choices: [], answer: null },
    ],
  };

  beforeEach(() => {
    Object.values(apiMock).forEach((f) => f.mockReset());
  });

  it("saves a radio choice immediately via PUT", async () => {
    apiMock.put.mockResolvedValue({});
    render(<QuizRunner attempt={attempt} exitHref="/x" onFinished={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("B"));
    expect(apiMock.put).toHaveBeenCalledWith("/api/v1/attempts/att-9/answers/11", { choice_ids: [2], text: "" });
  });

  it("navigates to the result when a save returns time_up", async () => {
    apiMock.put.mockRejectedValue(new ApiError(400, "Time's up", "time_up"));
    const onFinished = vi.fn();
    render(<QuizRunner attempt={attempt} exitHref="/x" onFinished={onFinished} />);
    fireEvent.click(screen.getByLabelText("A"));
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith({ reason: "time_up", auto: true }));
    expect(onFinished).toHaveBeenCalledTimes(1);
  });
});
