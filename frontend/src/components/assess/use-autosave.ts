"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, api } from "@/lib/api";

export type AnswerValue = { choice_ids: number[]; text: string };
export type SaveState = "idle" | "saving" | "saved" | "error";
export type TerminalCode = "time_up" | "already_submitted";

type SaveFn = (attemptId: string, questionId: number, answer: AnswerValue) => Promise<unknown>;

const defaultSave: SaveFn = (attemptId, questionId, answer) =>
  api.put(`/api/v1/attempts/${attemptId}/answers/${questionId}`, answer);

export const TEXT_DEBOUNCE_MS = 600;
const RETRY_DELAYS = [2000, 4000, 8000, 15000];

function isRetryable(err: unknown) {
  if (!(err instanceof ApiError)) return true; // network failure / offline
  return err.status >= 500 || err.status === 408 || err.status === 429;
}

/**
 * Autosaves quiz answers. Choice changes are sent immediately; typed text is debounced.
 * Saves for one question are serialized and only the latest value is sent. Retryable failures
 * (network, 5xx, 429) are retried with backoff and when the browser comes back online.
 * `time_up` / `already_submitted` stop everything and call onTerminal.
 */
export function useAutosave({
  attemptId,
  onTerminal,
  save = defaultSave,
  debounceMs = TEXT_DEBOUNCE_MS,
}: {
  attemptId: string;
  onTerminal: (code: TerminalCode, message: string) => void;
  save?: SaveFn;
  debounceMs?: number;
}) {
  const [state, setState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = useRef(new Map<number, AnswerValue>());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const inflight = useRef(new Map<number, Promise<void>>());
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const stopped = useRef(false);
  const failed = useRef(false);

  const latest = useRef({ attemptId, onTerminal, save });
  useEffect(() => {
    latest.current = { attemptId, onTerminal, save };
  }, [attemptId, onTerminal, save]);

  const refresh = useCallback(() => {
    if (stopped.current) return;
    if (inflight.current.size || timers.current.size) setState("saving");
    else if (failed.current) setState("error");
    else if (pending.current.size === 0) setState((s) => (s === "idle" ? "idle" : "saved"));
  }, []);

  const scheduleRetryRef = useRef<() => void>(() => {});

  const run = useCallback(
    (qid: number): Promise<void> => {
      const existing = inflight.current.get(qid);
      if (existing) return existing; // the running loop picks up the newer value
      const p = (async () => {
        while (pending.current.has(qid) && !stopped.current) {
          const answer = pending.current.get(qid)!;
          pending.current.delete(qid);
          try {
            const { attemptId: id, save: fn } = latest.current;
            await fn(id, qid, answer);
            retryCount.current = 0;
            failed.current = false;
            setError(null);
            setSavedAt(Date.now());
          } catch (err) {
            if (err instanceof ApiError && (err.code === "time_up" || err.code === "already_submitted")) {
              stopped.current = true;
              pending.current.clear();
              latest.current.onTerminal(err.code, err.message);
              return;
            }
            if (!pending.current.has(qid)) pending.current.set(qid, answer); // keep for retry unless superseded
            failed.current = true;
            if (isRetryable(err)) {
              setError("Couldn't save — retrying");
              scheduleRetryRef.current();
            } else {
              pending.current.delete(qid);
              setError(err instanceof Error ? err.message : "Couldn't save this answer.");
            }
            return;
          }
        }
      })().finally(() => {
        inflight.current.delete(qid);
        refresh();
      });
      inflight.current.set(qid, p);
      setState("saving");
      return p;
    },
    [refresh],
  );

  const retryAll = useCallback(() => {
    retryTimer.current = null;
    for (const qid of [...pending.current.keys()]) {
      if (!timers.current.has(qid)) void run(qid);
    }
  }, [run]);

  useEffect(() => {
    scheduleRetryRef.current = () => {
      if (retryTimer.current || stopped.current) return;
      const delay = RETRY_DELAYS[Math.min(retryCount.current, RETRY_DELAYS.length - 1)];
      retryCount.current += 1;
      retryTimer.current = setTimeout(retryAll, delay);
    };
  }, [retryAll]);

  useEffect(() => {
    const onOnline = () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryAll();
    };
    window.addEventListener("online", onOnline);
    const timersMap = timers.current;
    return () => {
      window.removeEventListener("online", onOnline);
      for (const t of timersMap.values()) clearTimeout(t);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [retryAll]);

  /** Save immediately (radio / checkbox). */
  const saveNow = useCallback(
    (qid: number, answer: AnswerValue) => {
      if (stopped.current) return;
      const t = timers.current.get(qid);
      if (t) clearTimeout(t);
      timers.current.delete(qid);
      pending.current.set(qid, answer);
      void run(qid);
    },
    [run],
  );

  /** Save after the user pauses typing. */
  const saveDebounced = useCallback(
    (qid: number, answer: AnswerValue) => {
      if (stopped.current) return;
      pending.current.set(qid, answer);
      const t = timers.current.get(qid);
      if (t) clearTimeout(t);
      timers.current.set(
        qid,
        setTimeout(() => {
          timers.current.delete(qid);
          void run(qid);
        }, debounceMs),
      );
      setState("saving");
    },
    [run, debounceMs],
  );

  /** Send anything still waiting (debounced text) and wait for all in-flight saves. Resolves true if all saved. */
  const flush = useCallback(async () => {
    for (const [qid, t] of timers.current) {
      clearTimeout(t);
      timers.current.delete(qid);
    }
    await Promise.all([...pending.current.keys()].map((qid) => run(qid)));
    await Promise.all([...inflight.current.values()]);
    return pending.current.size === 0;
  }, [run]);

  return { state, savedAt, error, saveNow, saveDebounced, flush };
}
