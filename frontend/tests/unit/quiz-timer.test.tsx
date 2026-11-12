import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuizTimer, formatRemaining } from "@/components/assess/quiz-timer";

const T0 = new Date("2026-11-11T10:00:00Z").getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const value = () => screen.getByTestId("timer-value").textContent;

describe("QuizTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats mm:ss and h:mm:ss", () => {
    expect(formatRemaining(65_000)).toBe("01:05");
    expect(formatRemaining(3_725_000)).toBe("1:02:05");
    expect(formatRemaining(-5)).toBe("00:00");
  });

  it("uses the server clock offset, not the device clock", () => {
    // Device clock is 5 minutes fast; the server says it's T0 and the deadline is T0 + 10 min.
    vi.setSystemTime(T0 + 5 * 60_000);
    render(<QuizTimer serverNow={iso(T0)} deadlineAt={iso(T0 + 10 * 60_000)} />);
    expect(value()).toBe("10:00");

    act(() => vi.advanceTimersByTime(1000));
    expect(value()).toBe("09:59");
  });

  it("honours receivedAt when server_now was fetched earlier than mount", () => {
    vi.setSystemTime(T0 + 30_000);
    // Fetched 30s ago (receivedAt = T0) when the server also said T0: 30s have already elapsed.
    render(<QuizTimer serverNow={iso(T0)} receivedAt={T0} deadlineAt={iso(T0 + 60_000)} />);
    expect(value()).toBe("00:30");
  });

  it("recomputes immediately on visibilitychange (phone sleep / app switch)", () => {
    vi.setSystemTime(T0);
    render(<QuizTimer serverNow={iso(T0)} deadlineAt={iso(T0 + 10 * 60_000)} />);
    expect(value()).toBe("10:00");

    // The device slept for 3 minutes: wall clock jumped, but no interval ticks ran.
    vi.setSystemTime(T0 + 3 * 60_000);
    expect(value()).toBe("10:00");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(value()).toBe("07:00");
  });

  it("switches to warning style under 2 minutes and announces thresholds politely", () => {
    vi.setSystemTime(T0);
    const { container } = render(<QuizTimer serverNow={iso(T0)} deadlineAt={iso(T0 + 2 * 60_000 + 5_000)} />);
    const box = container.firstElementChild as HTMLElement;
    expect(box.dataset.warning).toBeUndefined();
    expect(screen.getByRole("status")).toHaveTextContent("5 minutes left");

    act(() => vi.advanceTimersByTime(6_000));
    expect(box.dataset.warning).toBe("true");
    expect(screen.getByRole("status")).toHaveTextContent("2 minutes left");
  });

  it("fires onExpire exactly once when time runs out", () => {
    vi.setSystemTime(T0);
    const onExpire = vi.fn();
    render(<QuizTimer serverNow={iso(T0)} deadlineAt={iso(T0 + 30_000)} onExpire={onExpire} />);

    act(() => vi.advanceTimersByTime(29_000));
    expect(onExpire).not.toHaveBeenCalled();
    expect(value()).toBe("00:01");

    act(() => vi.advanceTimersByTime(1_000));
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(value()).toBe("00:00");

    act(() => vi.advanceTimersByTime(5_000));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("fires onExpire on load when the deadline has already passed", () => {
    vi.setSystemTime(T0);
    const onExpire = vi.fn();
    render(<QuizTimer serverNow={iso(T0)} deadlineAt={iso(T0 - 1000)} onExpire={onExpire} />);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
