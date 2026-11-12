"use client";

import { CheckCircle2, Circle, Clock } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { LocalDate } from "@/components/local-time";
import { CourseOutline } from "@/components/learn/outline";
import { Banner, ButtonLink, Card, ProgressBar, Skeleton } from "@/components/ui";
import { daysUntil } from "@/lib/format";
import { useLearn } from "@/lib/queries";
import type { Completion } from "@/lib/types";

function RequirementsSummary({ completion }: { completion: Completion }) {
  if (completion.requirements.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-subtle">
        {completion.issues_certificate ? "Certificate when complete:" : "To complete this course:"}
      </p>
      <ul className="flex flex-col gap-1">
        {completion.requirements.map((r) => (
          <li key={r.key} className="flex items-center gap-2 text-xs text-muted">
            {r.met ? (
              <CheckCircle2 className="size-4 shrink-0 text-ok" aria-hidden />
            ) : (
              <Circle className="size-4 shrink-0 text-[#9AA3AE]" aria-hidden />
            )}
            <span className="sr-only">{r.met ? "Met: " : "Not met yet: "}</span>
            <span className="flex-1">{r.label}</span>
            <span className="font-medium text-ink">{r.progress}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CourseHomePage() {
  const { slug } = useParams<{ slug: string }>();
  // Errors (403/404) are handled by the layout, which shares this query.
  const { data, isLoading } = useLearn(slug);

  if (isLoading || !data) {
    return isLoading ? (
      <div className="flex flex-col gap-3" aria-label="Loading course">
        <Skeleton className="h-40" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    ) : null;
  }

  const { outline, completion, enrollment, certificate, next_lesson: next } = data;
  const percent = outline.progress.percent;
  const expiresSoon = enrollment?.expires_at ? daysUntil(enrollment.expires_at) : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-3 lg:order-2">
        {data.staff_preview && (
          <Banner tone="info" title="Staff preview">
            You&apos;re viewing this course as staff, so every lesson is unlocked.
          </Banner>
        )}
        {certificate && (
          <Banner
            tone={certificate.valid ? "ok" : "warn"}
            title={certificate.valid ? "You've earned your certificate" : "Certificate revoked"}
            action={
              <Link href="/certificates" className="shrink-0 font-semibold underline">
                View
              </Link>
            }
          >
            {certificate.valid ? "Well done — you can download it from Certificates." : "Contact the institute for details."}
          </Banner>
        )}

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base">Your progress</h2>
            <span className="text-sm font-bold text-ink">{percent}%</span>
          </div>
          <ProgressBar value={percent} tone={completion.complete ? "ok" : "primary"} label="Course progress" />
          <p className="text-xs text-muted">
            {outline.progress.completed} of {outline.progress.total} required lessons complete
          </p>
          <RequirementsSummary completion={completion} />
          {next ? (
            <ButtonLink href={`/learn/${slug}/lessons/${next.id}`} block className="mt-1">
              <span className="truncate">Continue: {next.title}</span>
            </ButtonLink>
          ) : outline.progress.total > 0 && percent === 100 ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-ok">
              <CheckCircle2 className="size-4" aria-hidden /> All lessons complete
            </p>
          ) : null}
        </Card>

        {enrollment?.expires_at && (
          <p className="flex items-center gap-1.5 px-1 text-xs text-muted">
            <Clock className="size-3.5 shrink-0" aria-hidden />
            <span>
              Access until <LocalDate iso={enrollment.expires_at} />
              {expiresSoon !== null && expiresSoon >= 0 && expiresSoon <= 14 && (
                <span className="font-medium text-warn"> · {expiresSoon <= 1 ? "ends soon" : `${expiresSoon} days left`}</span>
              )}
            </span>
          </p>
        )}
        {!enrollment?.expires_at && enrollment && (
          <p className="flex items-center gap-1.5 px-1 text-xs text-muted">
            <Clock className="size-3.5 shrink-0" aria-hidden /> Lifetime access
          </p>
        )}
      </div>

      <section aria-labelledby="content-heading" className="lg:order-1">
        <h2 id="content-heading" className="sr-only">
          Course content
        </h2>
        <CourseOutline slug={slug} outline={outline} nextLessonId={next?.id} />
      </section>
    </div>
  );
}
