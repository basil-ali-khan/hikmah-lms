"use client";

import { useSyncExternalStore } from "react";

import { formatDate, formatDateTime } from "@/lib/format";

const subscribe = () => () => {};

/** Render in the viewer's time zone on the client; a stable UTC fallback during SSR avoids hydration mismatch. */
function useIsClient() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

export function LocalDateTime({ iso, withZone = true }: { iso: string; withZone?: boolean }) {
  const client = useIsClient();
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {client ? formatDateTime(iso, undefined, withZone) : formatDateTime(iso, "UTC", withZone)}
    </time>
  );
}

export function LocalDate({ iso }: { iso: string }) {
  const client = useIsClient();
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {client ? formatDate(iso, { year: undefined }) : formatDate(iso, { year: undefined }, "UTC")}
    </time>
  );
}

/** "2:00 PM GMT+0 · 7:00 PM PKT (institute)" — viewer time plus the institute's time when they differ. */
export function DualTime({ iso, instituteTz }: { iso: string; instituteTz: string }) {
  const client = useIsClient();
  if (!client) return <time dateTime={iso}>{formatDateTime(iso, "UTC")}</time>;
  const mine = formatDateTime(iso);
  const theirs = formatDateTime(iso, instituteTz);
  return (
    <time dateTime={iso}>
      {mine}
      {mine !== theirs && <span className="text-muted"> ({theirs.split(" · ")[1]} institute time)</span>}
    </time>
  );
}
