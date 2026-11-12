"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { Sheet } from "@/components/ui/sheet";
import { Banner, Button, Textarea, cn } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { Attempt, AttemptResult } from "@/lib/types";

import { QuizTimer } from "./quiz-timer";
import { SaveIndicator } from "./save-indicator";
import { useAutosave, type AnswerValue, type TerminalCode } from "./use-autosave";

type Question = Attempt["questions"][number];

const EMPTY: AnswerValue = { choice_ids: [], text: "" };

export function isAnswered(a: AnswerValue | undefined) {
  return !!a && (a.choice_ids.length > 0 || a.text.trim().length > 0);
}

function kindLabel(q: Question) {
  const marks = `${q.points} mark${q.points === 1 ? "" : "s"}`;
  if (q.kind === "single") return `Choose one answer · ${marks}`;
  if (q.kind === "multi") return `Choose all that apply · ${marks}`;
  return `Short answer · ${marks}`;
}

/** The quiz-taking experience: one question at a time, navigator, autosave, server-driven timer, submit sheet. */
export function QuizRunner({
  attempt,
  receivedAt,
  exitHref,
  onFinished,
}: {
  attempt: Attempt;
  /** Client time when `attempt.server_now` was fetched. */
  receivedAt?: number;
  exitHref: string;
  /** Called once the attempt is closed. `result` is present when we submitted it ourselves. */
  onFinished: (opts: { result?: AttemptResult; auto?: boolean; reason?: TerminalCode }) => void;
}) {
  const questions = attempt.questions;
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, q.answer ?? EMPTY])),
  );
  const [index, setIndex] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const finished = useRef(false);

  const finish = useCallback(
    (opts: Parameters<typeof onFinished>[0]) => {
      if (finished.current) return;
      finished.current = true;
      onFinished(opts);
    },
    [onFinished],
  );

  const onTerminal = useCallback((code: TerminalCode) => finish({ reason: code, auto: code === "time_up" }), [finish]);
  const autosave = useAutosave({ attemptId: attempt.id, onTerminal });

  const submit = useCallback(
    async (auto = false) => {
      if (finished.current) return;
      setSubmitting(true);
      setSubmitError(null);
      await autosave.flush().catch(() => false);
      try {
        const result = await api.post<AttemptResult>(`/api/v1/attempts/${attempt.id}/submit`, auto ? { auto: true } : undefined);
        finish({ result, auto });
      } catch (e) {
        if (auto || (e instanceof ApiError && (e.code === "time_up" || e.code === "already_submitted"))) {
          finish({ auto });
          return;
        }
        setSubmitError(errorMessage(e));
        setSubmitting(false);
      }
    },
    [attempt.id, autosave, finish],
  );

  const onExpire = useCallback(() => {
    setConfirmOpen(false);
    void submit(true);
  }, [submit]);

  const q = questions[index];
  const answer = answers[q.id] ?? EMPTY;
  const answeredCount = questions.filter((x) => isAnswered(answers[x.id])).length;
  const unanswered = questions.map((x, i) => ({ q: x, n: i + 1 })).filter(({ q: x }) => !isAnswered(answers[x.id]));
  const isLast = index === questions.length - 1;

  function setChoice(question: Question, choiceId: number, checked: boolean) {
    const prev = answers[question.id] ?? EMPTY;
    const choice_ids =
      question.kind === "single"
        ? [choiceId]
        : checked
          ? [...new Set([...prev.choice_ids, choiceId])]
          : prev.choice_ids.filter((c) => c !== choiceId);
    const next = { choice_ids, text: "" };
    setAnswers((a) => ({ ...a, [question.id]: next }));
    autosave.saveNow(question.id, next);
  }

  function setText(question: Question, text: string) {
    const next = { choice_ids: [], text };
    setAnswers((a) => ({ ...a, [question.id]: next }));
    autosave.saveDebounced(question.id, next);
  }

  function go(i: number) {
    setIndex(Math.max(0, Math.min(questions.length - 1, i)));
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  const timer = attempt.deadline_at ? (
    <QuizTimer deadlineAt={attempt.deadline_at} serverNow={attempt.server_now} receivedAt={receivedAt} onExpire={onExpire} />
  ) : null;

  const navigator = (
    <nav aria-label="Questions">
      <ol className="grid grid-cols-5 gap-2">
        {questions.map((x, i) => {
          const done = isAnswered(answers[x.id]);
          const current = i === index;
          return (
            <li key={x.id}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={current ? "step" : undefined}
                aria-label={`Question ${i + 1}${done ? ", answered" : ", not answered"}`}
                className={cn(
                  "flex h-11 w-full items-center justify-center rounded-lg border text-sm font-medium",
                  done ? "border-primary bg-primary-soft text-primary" : "border-line bg-white text-subtle",
                  current && "ring-2 ring-primary ring-offset-1",
                )}
              >
                {i + 1}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );

  const questionBody = (
    <fieldset className="flex flex-col gap-3" key={q.id}>
      <legend className="mb-1 flex w-full flex-col gap-2">
        <span className="text-xs font-medium tracking-wide text-muted uppercase">{kindLabel(q)}</span>
        <span className="font-heading text-lg leading-snug font-bold whitespace-pre-wrap text-ink md:text-xl">{q.text}</span>
      </legend>
      {q.kind === "short" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`q-${q.id}-text`} className="sr-only">
            Your answer
          </label>
          <Textarea
            id={`q-${q.id}-text`}
            value={answer.text}
            maxLength={5000}
            rows={6}
            placeholder="Type your answer"
            onChange={(e) => setText(q, e.target.value)}
          />
          <p className="text-xs text-muted">Graded by your instructor.</p>
        </div>
      ) : (
        q.choices.map((c) => {
          const checked = answer.choice_ids.includes(c.id);
          return (
            <label
              key={c.id}
              className={cn(
                "flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-[15px] transition-colors",
                checked ? "border-primary bg-primary-soft" : "border-line bg-white hover:border-primary",
              )}
            >
              <input
                type={q.kind === "single" ? "radio" : "checkbox"}
                name={`q-${q.id}`}
                value={c.id}
                checked={checked}
                onChange={(e) => setChoice(q, c.id, e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--brand-primary)]"
              />
              <span className="whitespace-pre-wrap">{c.text}</span>
            </label>
          );
        })
      )}
    </fieldset>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line-soft bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:h-16 md:px-6">
          <Link
            href={exitHref}
            className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-[#F2F4F7]"
            aria-label="Leave quiz (the timer keeps running)"
          >
            <X className="size-5" aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink md:hidden">
              Question {index + 1} of {questions.length}
            </p>
            <p className="hidden truncate font-heading font-bold text-ink md:block">{attempt.quiz.title}</p>
            <SaveIndicator state={autosave.state} savedAt={autosave.savedAt} error={autosave.error} className="hidden md:inline-flex" />
          </div>
          {timer}
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-5 px-4 py-5 md:px-6 lg:grid-cols-[1fr_300px]">
        <section aria-label={`Question ${index + 1} of ${questions.length}`} className="flex flex-col gap-4">
          <p className="hidden text-sm text-muted md:block">
            Question {index + 1} of {questions.length}
          </p>
          <div className="rounded-[var(--radius-card)] border border-line bg-white p-4 md:p-6">{questionBody}</div>
          <SaveIndicator state={autosave.state} savedAt={autosave.savedAt} error={autosave.error} className="md:hidden" />

          <div className="lg:hidden">{navigator}</div>

          <div className="pb-safe sticky bottom-0 -mx-4 mt-auto flex gap-3 border-t border-line-soft bg-white px-4 py-3 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
            <Button variant="outline" className="flex-1 md:flex-none" onClick={() => go(index - 1)} disabled={index === 0}>
              <ChevronLeft className="size-4" aria-hidden /> Previous
            </Button>
            {isLast ? (
              <Button className="flex-1 md:flex-none" onClick={() => setConfirmOpen(true)}>
                Review &amp; submit
              </Button>
            ) : (
              <Button className="flex-1 md:flex-none" onClick={() => go(index + 1)}>
                Next <ChevronRight className="size-4" aria-hidden />
              </Button>
            )}
          </div>
          {!isLast && (
            <Button variant="ghost" className="lg:hidden" onClick={() => setConfirmOpen(true)}>
              Submit quiz
            </Button>
          )}
        </section>

        <aside className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-white p-4">
            <h2 className="text-base">Questions</h2>
            {navigator}
            <p className="text-sm text-muted">
              {answeredCount} answered · {questions.length - answeredCount} left
            </p>
            <Button block onClick={() => setConfirmOpen(true)}>
              Submit quiz
            </Button>
          </div>
        </aside>
      </div>

      <Sheet
        open={confirmOpen}
        onOpenChange={(o) => !submitting && setConfirmOpen(o)}
        title="Submit your quiz?"
        description={`${answeredCount} of ${questions.length} answered`}
      >
        <div className="flex flex-col gap-3">
          {unanswered.length > 0 ? (
            <Banner tone="warn" title={`${unanswered.length} question${unanswered.length === 1 ? " is" : "s are"} unanswered`}>
              <ul className="mt-1 flex flex-wrap gap-2">
                {unanswered.map(({ q: x, n }) => (
                  <li key={x.id}>
                    <button
                      type="button"
                      className="min-h-9 rounded-lg bg-white px-3 text-sm font-medium text-ink underline"
                      onClick={() => {
                        setConfirmOpen(false);
                        go(n - 1);
                      }}
                    >
                      Question {n}
                    </button>
                  </li>
                ))}
              </ul>
            </Banner>
          ) : (
            <p className="text-sm text-subtle">You&apos;ve answered every question.</p>
          )}
          <p className="text-sm text-subtle">You can&apos;t change your answers after submitting.</p>
          {submitError && (
            <p role="alert" className="text-sm font-medium text-bad">
              {submitError}
            </p>
          )}
          <Button block size="lg" onClick={() => submit(false)} loading={submitting}>
            Submit quiz
          </Button>
          <Button block variant="subtle" onClick={() => setConfirmOpen(false)} disabled={submitting}>
            Keep working
          </Button>
        </div>
      </Sheet>

      {submitting && !confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80" role="status">
          <p className="font-medium text-ink">Submitting your answers…</p>
        </div>
      )}
    </div>
  );
}
