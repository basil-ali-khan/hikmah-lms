"use client";

import { Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/components/ui";

/** Thresholds (ms) at which the remaining time is announced to screen readers. */
const ANNOUNCE_AT = [5 * 60_000, 2 * 60_000, 60_000];
const WARN_BELOW = 2 * 60_000;

export function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Countdown driven by the SERVER clock. The device clock may be wrong, so we measure
 * offset = server_now − (client time when that server_now was received) and always compute
 * remaining = deadline − (Date.now() + offset). Nothing accumulates between ticks, so a phone
 * that sleeps or a backgrounded tab (throttled timers) is correct the moment it wakes; we also
 * recompute immediately on visibilitychange / focus.
 */
export function useServerCountdown({
  deadlineAt,
  serverNow,
  receivedAt,
  onExpire,
}: {
  deadlineAt: string;
  serverNow: string;
  /** Client epoch ms when `serverNow` was received (e.g. React Query's dataUpdatedAt). Defaults to mount time. */
  receivedAt?: number;
  onExpire?: () => void;
}) {
  const deadline = Date.parse(deadlineAt);
  const server = Date.parse(serverNow);
  const [remaining, setRemaining] = useState<number | null>(null);
  const expireRef = useRef(onExpire);
  const firedRef = useRef(false);

  useEffect(() => {
    expireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const offset = server - (receivedAt ?? Date.now());
    const tick = () => {
      const left = deadline - (Date.now() + offset);
      setRemaining(Math.max(0, left));
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        expireRef.current?.();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    window.addEventListener("pageshow", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
      window.removeEventListener("pageshow", tick);
    };
  }, [deadline, server, receivedAt]);

  return remaining;
}

function announcementFor(remaining: number | null) {
  if (remaining === null || remaining <= 0) return "";
  // Most urgent threshold already crossed; announce once per threshold (text only changes at these points).
  const crossed = ANNOUNCE_AT.filter((t) => remaining <= t);
  if (!crossed.length) return "";
  const t = crossed[crossed.length - 1];
  const mins = t / 60_000;
  return `${mins} minute${mins === 1 ? "" : "s"} left`;
}

export function QuizTimer({
  deadlineAt,
  serverNow,
  receivedAt,
  onExpire,
  className,
}: {
  deadlineAt: string;
  serverNow: string;
  receivedAt?: number;
  onExpire?: () => void;
  className?: string;
}) {
  const remaining = useServerCountdown({ deadlineAt, serverNow, receivedAt, onExpire });
  const warn = remaining !== null && remaining < WARN_BELOW;
  const announcement = announcementFor(remaining);

  return (
    <div
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 font-mono text-[15px] font-bold tabular-nums",
        warn ? "bg-bad-soft text-bad" : "bg-[#F2F4F7] text-heading",
        className,
      )}
      data-warning={warn || undefined}
    >
      <Clock className="size-4" aria-hidden />
      {/* The ticking value is hidden from screen readers; only threshold announcements are spoken. */}
      <span aria-hidden data-testid="timer-value">
        {remaining === null ? "--:--" : formatRemaining(remaining)}
      </span>
      <span className="sr-only">Time remaining: {remaining === null ? "" : formatRemaining(remaining)}</span>
      <span className="sr-only" aria-live="polite" role="status">
        {announcement}
      </span>
    </div>
  );
}
