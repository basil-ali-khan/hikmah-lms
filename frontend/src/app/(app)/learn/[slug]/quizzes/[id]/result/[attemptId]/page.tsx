"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AppPage } from "@/components/app-shell";
import { Banner, ButtonLink, Card, Chip, EmptyState, ErrorState, PageHeader, Skeleton, cn } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { useAttemptResult, useQuiz } from "@/lib/queries";
import type { AttemptResult } from "@/lib/types";

function ScoreRing({ percent, passed, pending }: { percent: number; passed: boolean; pending: boolean }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, percent));
  const stroke = pending ? "var(--color-primary)" : passed ? "var(--color-ok)" : "var(--color-bad)";
  return (
    <div className="relative size-36" role="img" aria-label={`Score ${Math.round(v)} percent`}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#E6E9EE" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-heading text-3xl font-bold text-ink" aria-hidden>
        {Math.round(v)}%
      </span>
    </div>
  );
}

function duration(seconds: number | null) {
  if (seconds === null) return null;
  const m = Math.round(seconds / 60);
  return m < 1 ? "under a minute" : `${m} min`;
}

function ReviewItem({ item, n }: { item: AttemptResult["review"][number]; n: number }) {
  const correct = item.is_correct;
  const yourChoices = item.choices.filter((c) => item.your_choice_ids.includes(c.id));
  const correctChoices = item.choices.filter((c) => c.is_correct);
  return (
    <li className="flex flex-col gap-2 border-b border-line-soft py-4 last:border-0">
      <div className="flex items-start gap-2">
        {correct === true ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-label="Correct" />
        ) : correct === false ? (
          <XCircle className="mt-0.5 size-5 shrink-0 text-bad" aria-label="Incorrect" />
        ) : (
          <span className="mt-0.5 size-5 shrink-0 rounded-full border-2 border-primary" aria-label="Awaiting grade" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium whitespace-pre-wrap text-ink">
            Q{n}. {item.text}
          </p>
          <p className="text-xs text-muted">
            {item.points_awarded === null ? "Awaiting grade" : `${item.points_awarded} / ${item.points}`} mark
            {item.points === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <dl className="ml-7 flex flex-col gap-1 text-sm">
        <div>
          <dt className="inline text-muted">Your answer: </dt>
          <dd className="inline text-ink">
            {item.kind === "short"
              ? item.your_text || "No answer"
              : yourChoices.length
                ? yourChoices.map((c) => c.text).join(", ")
                : "No answer"}
          </dd>
        </div>
        {item.kind !== "short" && correct !== true && correctChoices.length > 0 && (
          <div>
            <dt className="inline text-muted">Correct: </dt>
            <dd className="inline font-medium text-ok">{correctChoices.map((c) => c.text).join(", ")}</dd>
          </div>
        )}
        {item.feedback && (
          <div className="mt-1 rounded-lg bg-[#F6F7F9] px-3 py-2">
            <dt className="text-xs font-medium text-muted">Feedback</dt>
            <dd className="whitespace-pre-wrap text-ink">{item.feedback}</dd>
          </div>
        )}
      </dl>
    </li>
  );
}

function ResultContent() {
  const { slug, id, attemptId } = useParams<{ slug: string; id: string; attemptId: string }>();
  const search = useSearchParams();
  const { data: r, isLoading, error, refetch } = useAttemptResult(attemptId);
  const { data: quiz } = useQuiz(id);
  const courseHref = `/learn/${slug}`;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-label="Loading result">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-56" />
      </div>
    );
  }
  if (error || !r) {
    const e = error instanceof ApiError ? error : null;
    if (e?.code === "in_progress") {
      return (
        <EmptyState
          title="This attempt is still in progress"
          action={<ButtonLink href={`/learn/${slug}/quizzes/${id}/attempt/${attemptId}`}>Resume attempt</ButtonLink>}
        >
          Submit the attempt to see your result.
        </EmptyState>
      );
    }
    if (e && (e.status === 403 || e.status === 404)) {
      return (
        <EmptyState title="Result not available" action={<ButtonLink href={courseHref} variant="outline">Back to course</ButtonLink>}>
          {errorMessage(error)}
        </EmptyState>
      );
    }
    return <ErrorState error={error} retry={refetch} />;
  }

  const autoSubmitted = r.auto_submitted || search.get("auto") === "1";
  const correctCount = r.review.filter((x) => x.is_correct === true).length;
  const canRetry = quiz && quiz.window === "open" && quiz.summary.attempts_left > 0 && !quiz.summary.in_progress_attempt;
  const time = duration(r.duration_seconds);

  return (
    <>
      <PageHeader title={`${r.quiz.title} · result`} back={{ href: `/learn/${slug}/quizzes/${id}`, label: "Quiz" }} />
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col items-center gap-3 py-6 text-center">
          <ScoreRing percent={r.percent ?? 0} passed={r.passed} pending={r.needs_grading} />
          {r.needs_grading ? (
            <Chip tone="primary">Awaiting grade</Chip>
          ) : (
            <Chip tone={r.passed ? "ok" : "bad"} className="h-7 text-sm">
              {r.passed ? "Passed" : "Not passed"}
            </Chip>
          )}
          <p className="text-sm text-subtle">
            {r.answers_visible && r.review.length > 0 && `${correctCount} of ${r.review.length} correct · `}
            {r.score !== null && r.max_score !== null && !r.answers_visible && `${r.score} of ${r.max_score} marks · `}
            attempt {r.number}
            {time && ` · ${time}`}
          </p>
          <p className="text-xs text-muted">Pass mark {r.quiz.pass_percent}%</p>
        </Card>

        {autoSubmitted && (
          <Banner tone="info" title="Time's up">
            Your attempt was submitted automatically with the answers you saved.
          </Banner>
        )}
        {r.needs_grading && (
          <Banner tone="info">
            A short-answer question is waiting for the instructor to grade it. Your score may change.
          </Banner>
        )}

        {r.answers_visible ? (
          <section aria-labelledby="review">
            <h2 id="review" className="mb-2 text-lg">
              Review
            </h2>
            <Card className="py-0">
              <ol>
                {r.review.map((item, i) => (
                  <ReviewItem key={item.question_id} item={item} n={i + 1} />
                ))}
              </ol>
            </Card>
          </section>
        ) : (
          <p className="text-sm text-muted">Answers for this quiz aren&apos;t shown yet. Your instructor decides when they&apos;re released.</p>
        )}

        <div className={cn("flex flex-col gap-3 md:flex-row")}>
          <ButtonLink href={courseHref} variant={canRetry ? "outline" : "primary"} block className="md:w-auto">
            Back to course
          </ButtonLink>
          {canRetry && (
            <ButtonLink href={`/learn/${slug}/quizzes/${id}`} block className="md:w-auto">
              Try again
            </ButtonLink>
          )}
        </div>
      </div>
    </>
  );
}

export default function QuizResultPage() {
  return (
    <AppPage>
      <Suspense fallback={<Skeleton className="h-56" />}>
        <ResultContent />
      </Suspense>
    </AppPage>
  );
}
