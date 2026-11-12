"use client";

import { useMutation } from "@tanstack/react-query";
import { Video as VideoIcon } from "lucide-react";
import { useState } from "react";

import { useSite } from "@/components/providers";
import { Button, cn } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import type { Session } from "@/lib/types";

import { useNow } from "./use-now";

export type JoinState = Session["join_state"];

/**
 * The server sends join_state, but the page may sit open for a while; recompute it locally so the
 * button enables itself when the join window opens (the query also refetches every 30s).
 */
export function effectiveJoinState(
  session: Pick<Session, "join_state" | "starts_at" | "ends_at">,
  now: number,
  joinWindowMinutes: number,
): JoinState {
  if (!now) return session.join_state;
  if (session.join_state === "ended") return "ended";
  const start = Date.parse(session.starts_at);
  const end = Date.parse(session.ends_at);
  if (now > end) return "ended";
  if (now >= start - joinWindowMinutes * 60_000) return "open";
  return session.join_state;
}

export function useJoinState(session: Pick<Session, "join_state" | "starts_at" | "ends_at">) {
  const site = useSite();
  const now = useNow(30_000);
  return effectiveJoinState(session, now, site.join_window_minutes);
}

/** Join class button. Upcoming: disabled with when-it-opens text. Open: logs the join, opens the meeting link. Ended: nothing. */
export function JoinButton({
  session,
  variant = "primary",
  block,
  className,
}: {
  session: Pick<Session, "id" | "join_state" | "starts_at" | "ends_at" | "title">;
  variant?: "primary" | "accent";
  block?: boolean;
  className?: string;
}) {
  const site = useSite();
  const toast = useToast();
  const state = useJoinState(session);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);

  const join = useMutation({
    mutationFn: () => api.post<{ join_url: string }>(`/api/v1/live/${session.id}/join`),
    onSuccess: ({ join_url }) => {
      setJoinUrl(join_url);
      window.open(join_url, "_blank", "noopener");
    },
    onError: (err) => toast(errorMessage(err), "error"),
  });

  if (state === "ended") return null;

  if (state === "upcoming") {
    return (
      <Button variant="primary" block={block} className={className} disabled>
        Join opens {site.join_window_minutes} min before start
      </Button>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1.5", block && "w-full", className)}>
      <Button
        variant={variant}
        block={block}
        loading={join.isPending}
        onClick={() => join.mutate()}
        aria-label={`Join class: ${session.title}`}
      >
        <VideoIcon className="size-4" aria-hidden />
        Join class
      </Button>
      {joinUrl && (
        <a
          href={joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("text-center text-xs font-medium underline", variant === "accent" ? "text-white" : "text-primary")}
        >
          Class didn&apos;t open? Tap here
        </a>
      )}
    </div>
  );
}
