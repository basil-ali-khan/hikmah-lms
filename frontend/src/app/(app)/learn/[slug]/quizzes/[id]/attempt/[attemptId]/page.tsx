"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

import { AppPage } from "@/components/app-shell";
import { QuizRunner } from "@/components/assess/quiz-runner";
import { ButtonLink, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { keys, useAttempt } from "@/lib/queries";
import type { AttemptResult } from "@/lib/types";

export default function QuizAttemptPage() {
  const { slug, id, attemptId } = useParams<{ slug: string; id: string; attemptId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: attempt, dataUpdatedAt, isLoading, error, refetch } = useAttempt(attemptId);

  const resultHref = `/learn/${slug}/quizzes/${id}/result/${attemptId}`;

  // Already closed (submitted elsewhere, or the server auto-submitted after the deadline): show the result.
  useEffect(() => {
    if (attempt && attempt.status !== "in_progress") router.replace(resultHref);
  }, [attempt, resultHref, router]);

  const onFinished = useCallback(
    ({ result, auto }: { result?: AttemptResult; auto?: boolean }) => {
      if (result) qc.setQueryData(keys.result(attemptId), result);
      else void qc.invalidateQueries({ queryKey: keys.result(attemptId) });
      void qc.invalidateQueries({ queryKey: keys.quiz(id) });
      void qc.invalidateQueries({ queryKey: keys.learn(slug) });
      qc.removeQueries({ queryKey: keys.attempt(attemptId) });
      router.replace(auto ? `${resultHref}?auto=1` : resultHref);
    },
    [attemptId, id, qc, resultHref, router, slug],
  );

  if (isLoading || (attempt && attempt.status !== "in_progress")) return <Spinner label="Loading quiz" />;

  if (error || !attempt) {
    const status = error instanceof ApiError ? error.status : 0;
    return (
      <AppPage>
        {status === 403 || status === 404 ? (
          <EmptyState
            title="This attempt isn't available"
            action={
              <ButtonLink href={`/learn/${slug}/quizzes/${id}`} variant="outline">
                Back to quiz
              </ButtonLink>
            }
          >
            {errorMessage(error)}
          </EmptyState>
        ) : (
          <ErrorState error={error} retry={refetch} />
        )}
      </AppPage>
    );
  }

  return (
    <QuizRunner
      // Remount only for a different attempt; refetches (window focus) refresh the timer's server offset.
      key={attempt.id}
      attempt={attempt}
      receivedAt={dataUpdatedAt}
      exitHref={`/learn/${slug}/quizzes/${id}`}
      onFinished={onFinished}
    />
  );
}
