"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { AppPage } from "@/components/app-shell";
import { LocalDateTime } from "@/components/local-time";
import { Banner, Button, ButtonLink, Card, Chip, EmptyState, ErrorState, Html, PageHeader, Skeleton } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { keys, useQuiz } from "@/lib/queries";
import type { QuizDetail } from "@/lib/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft py-3 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{children}</dd>
    </div>
  );
}

function attemptLabel(a: QuizDetail["attempts"][number]) {
  if (a.status === "in_progress") return { text: "In progress", tone: "primary" as const };
  if (a.status === "needs_grading") return { text: "Awaiting grade", tone: "warn" as const };
  return { text: a.percent === null ? "Submitted" : `${Math.round(a.percent)}%`, tone: "mute" as const };
}

export default function QuizIntroPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: quiz, isLoading, error, refetch } = useQuiz(id);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const back = { href: `/learn/${slug}`, label: quiz?.course.title ?? "Back to course" };

  async function start() {
    if (!quiz) return;
    if (quiz.summary.in_progress_attempt) {
      router.push(`/learn/${slug}/quizzes/${id}/attempt/${quiz.summary.in_progress_attempt}`);
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      const attempt = await api.post<{ id: string }>(`/api/v1/quizzes/${id}/attempts`);
      await qc.invalidateQueries({ queryKey: keys.quiz(id) });
      router.push(`/learn/${slug}/quizzes/${id}/attempt/${attempt.id}`);
    } catch (e) {
      setStartError(errorMessage(e));
      setStarting(false);
      void refetch();
    }
  }

  if (isLoading) {
    return (
      <AppPage>
        <div className="flex flex-col gap-3" aria-label="Loading quiz">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24" />
          <Skeleton className="h-48" />
        </div>
      </AppPage>
    );
  }

  if (error || !quiz) {
    const status = error instanceof ApiError ? error.status : 0;
    return (
      <AppPage>
        <PageHeader title="Quiz" back={{ href: `/learn/${slug}`, label: "Back to course" }} />
        {status === 403 || status === 404 ? (
          <EmptyState title={status === 404 ? "Quiz not found" : "You don't have access to this quiz"}>
            {errorMessage(error)}
          </EmptyState>
        ) : (
          <ErrorState error={error} retry={refetch} />
        )}
      </AppPage>
    );
  }

  const s = quiz.summary;
  const resumeId = s.in_progress_attempt;
  const canStart = !!resumeId || (quiz.window === "open" && s.attempts_left > 0);

  return (
    <AppPage>
      <PageHeader title={quiz.title} back={back} />
      <div className="flex flex-col gap-4">
        {quiz.instructions_html && (
          <Card>
            <Html html={quiz.instructions_html} />
          </Card>
        )}

        <Card className="py-1">
          <dl>
            <Row label="Questions">{quiz.question_count}</Row>
            <Row label="Time limit">{quiz.time_limit_minutes ? `${quiz.time_limit_minutes} minutes` : "No time limit"}</Row>
            <Row label="Pass mark">{quiz.pass_percent}%</Row>
            <Row label="Attempts">
              {s.attempts_used} of {quiz.max_attempts} used
              {s.best_percent !== null && ` · best ${Math.round(s.best_percent)}%`}
            </Row>
            {quiz.opens_at && quiz.window === "not_open" && (
              <Row label="Opens">
                <LocalDateTime iso={quiz.opens_at} />
              </Row>
            )}
            {quiz.closes_at && (
              <Row label={quiz.window === "closed" ? "Closed" : "Closes"}>
                <LocalDateTime iso={quiz.closes_at} />
              </Row>
            )}
          </dl>
        </Card>

        {s.passed && <Banner tone="ok">You&apos;ve passed this quiz.</Banner>}
        {s.needs_grading && (
          <Banner tone="info">A short-answer question is waiting for the instructor to grade it. Your score may change.</Banner>
        )}

        {resumeId ? (
          <Banner tone="warn" title="You have an attempt in progress">
            The timer keeps running while you&apos;re away. Resume now to finish it.
          </Banner>
        ) : quiz.window === "not_open" ? (
          <Banner tone="info" title="This quiz hasn't opened yet">
            {quiz.opens_at ? (
              <>
                It opens <LocalDateTime iso={quiz.opens_at} />.
              </>
            ) : (
              "Check back later."
            )}
          </Banner>
        ) : quiz.window === "closed" ? (
          <Banner tone="bad" title="This quiz has closed">
            No more attempts can be started.
          </Banner>
        ) : s.attempts_left <= 0 ? (
          <Banner tone="info" title="No attempts left">
            You&apos;ve used all {quiz.max_attempts} attempts. {quiz.score_policy === "highest" ? "Your best score counts." : "Your latest score counts."}
          </Banner>
        ) : (
          <Banner tone="warn">
            {quiz.time_limit_minutes
              ? "The timer keeps running if you leave the quiz. Answers save automatically."
              : "Answers save automatically. You can leave and come back before submitting."}
          </Banner>
        )}

        {startError && (
          <p role="alert" className="text-sm font-medium text-bad">
            {startError}
          </p>
        )}

        {canStart ? (
          <Button size="lg" block onClick={start} loading={starting} className="md:w-auto md:self-start">
            {resumeId ? "Resume attempt" : `Start attempt ${s.attempts_used + 1}`}
          </Button>
        ) : (
          <ButtonLink href={`/learn/${slug}`} variant="outline" block className="md:w-auto md:self-start">
            Back to course
          </ButtonLink>
        )}

        {quiz.attempts.length > 0 && (
          <section aria-labelledby="past-attempts" className="flex flex-col gap-2">
            <h2 id="past-attempts" className="text-lg">
              Your attempts
            </h2>
            <Card className="py-1">
              <ul>
                {[...quiz.attempts].reverse().map((a) => {
                  const label = attemptLabel(a);
                  const href =
                    a.status === "in_progress"
                      ? `/learn/${slug}/quizzes/${id}/attempt/${a.id}`
                      : `/learn/${slug}/quizzes/${id}/result/${a.id}`;
                  return (
                    <li key={a.id} className="border-b border-line-soft last:border-0">
                      <Link href={href} className="flex min-h-14 items-center gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">Attempt {a.number}</p>
                          <p className="truncate text-xs text-muted">
                            <LocalDateTime iso={a.submitted_at ?? a.started_at} />
                            {a.auto_submitted && " · auto-submitted"}
                          </p>
                        </div>
                        <Chip tone={label.tone}>{label.text}</Chip>
                        <ChevronRight className="size-4 text-muted" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        )}
      </div>
    </AppPage>
  );
}
