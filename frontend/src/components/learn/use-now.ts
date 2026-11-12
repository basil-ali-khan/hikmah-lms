"use client";

import { useCallback, useSyncExternalStore } from "react";

// Rounded to the second so repeated snapshot reads within one render agree.
const getNow = () => Math.floor(Date.now() / 1000) * 1000;
const getServerNow = () => 0;

/**
 * Current time (ms) that re-renders the caller every `intervalMs`. Returns 0 during SSR,
 * so callers should fall back to server-computed state when it is 0.
 */
export function useNow(intervalMs = 30_000) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const id = setInterval(onChange, intervalMs);
      return () => clearInterval(id);
    },
    [intervalMs],
  );
  return useSyncExternalStore(subscribe, getNow, getServerNow);
}
