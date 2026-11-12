"use client";

import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/components/ui";

import type { SaveState } from "./use-autosave";

function agoLabel(savedAt: number, now: number) {
  const secs = Math.max(0, Math.round((now - savedAt) / 1000));
  if (secs < 5) return "Saved just now";
  if (secs < 60) return `Saved ${secs}s ago`;
  const mins = Math.round(secs / 60);
  return `Saved ${mins} min ago`;
}

/** "Saving…" / "Saved 12s ago" / "Couldn't save — retrying". Polite status, not re-announced every tick. */
export function SaveIndicator({
  state,
  savedAt,
  error,
  className,
}: {
  state: SaveState;
  savedAt: number | null;
  error: string | null;
  className?: string;
}) {
  const [now, setNow] = useState(() => savedAt ?? 0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 5000);
    const t = window.setTimeout(tick, 0);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(t);
    };
  }, [savedAt]);

  let content: React.ReactNode = null;
  if (state === "saving") {
    content = (
      <>
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
      </>
    );
  } else if (state === "error") {
    content = (
      <>
        <AlertTriangle className="size-3.5" aria-hidden /> {error ?? "Couldn't save — retrying"}
      </>
    );
  } else if (savedAt) {
    content = (
      <>
        <Check className="size-3.5" aria-hidden /> {agoLabel(savedAt, Math.max(now, savedAt))}
      </>
    );
  } else {
    content = "Answers save automatically";
  }

  return (
    <p
      className={cn("inline-flex items-center gap-1.5 text-xs", state === "error" ? "font-medium text-bad" : "text-muted", className)}
      role={state === "error" ? "alert" : undefined}
    >
      {content}
    </p>
  );
}
