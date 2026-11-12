"use client";

import { Lock, SearchX } from "lucide-react";

import { ButtonLink, EmptyState, ErrorState } from "@/components/ui";
import { ApiError } from "@/lib/api";

/** Friendly screens for 403 (not enrolled / expired) and 404, with a generic retry fallback. */
export function CourseAccessError({
  error,
  slug,
  retry,
  notFoundTitle = "We couldn't find that",
  backHref,
}: {
  error: unknown;
  slug: string;
  retry?: () => void;
  notFoundTitle?: string;
  backHref?: { href: string; label: string };
}) {
  if (error instanceof ApiError && error.status === 403) {
    return (
      <EmptyState
        icon={<Lock className="size-6" aria-hidden />}
        title="You don't have access to this course"
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <ButtonLink href={`/courses/${slug}`}>View course page</ButtonLink>
            <ButtonLink href="/my-courses" variant="outline">
              My courses
            </ButtonLink>
          </div>
        }
      >
        {error.message || "You need an active enrollment to open this course."}
      </EmptyState>
    );
  }
  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState
        icon={<SearchX className="size-6" aria-hidden />}
        title={notFoundTitle}
        action={
          <ButtonLink href={backHref?.href ?? `/learn/${slug}`} variant="outline">
            {backHref?.label ?? "Back to course"}
          </ButtonLink>
        }
      >
        It may have been moved or isn&apos;t published yet.
      </EmptyState>
    );
  }
  return <ErrorState error={error} retry={retry} />;
}

export const isAccessError = (error: unknown) => error instanceof ApiError && (error.status === 403 || error.status === 404);
