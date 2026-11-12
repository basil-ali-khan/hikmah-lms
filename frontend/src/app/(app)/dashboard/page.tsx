"use client";

import { BookOpen, ClipboardList, FileQuestion } from "lucide-react";
import Link from "next/link";

import { AppPage } from "@/components/app-shell";
import { CourseThumb } from "@/components/course/course-card";
import { LocalDateTime } from "@/components/local-time";
import { EmailVerifyBanner } from "@/components/email-verify-banner";
import { useSite } from "@/components/providers";
import { Banner, ButtonLink, Card, Chip, EmptyState, ErrorState, ProgressBar, Skeleton } from "@/components/ui";
import { daysUntil, formatTime, relativeTime } from "@/lib/format";
import { useDashboard, useMe } from "@/lib/queries";

export default function DashboardPage() {
  const site = useSite();
  const { data: me } = useMe();
  const { data, isLoading, error, refetch } = useDashboard();

  return (
    <AppPage wide>
      <h1 className="mb-4 text-[22px] md:text-[26px]">Assalamu alaikum, {me?.first_name}</h1>
      <div className="flex flex-col gap-4">
        <EmailVerifyBanner />
        {isLoading && (
          <div className="flex flex-col gap-3" aria-label="Loading dashboard">
            <Skeleton className="h-36" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        )}
        {error && <ErrorState error={error} retry={refetch} />}
        {data && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
              {data.next_session && (
                <Card className="flex flex-col gap-2 border-0 bg-primary text-white md:flex-row md:items-center md:gap-5">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Chip tone="accent" className="w-fit">
                      {data.next_session.join_state === "open" ? "Live now" : `Live ${relativeTime(data.next_session.starts_at)}`}
                    </Chip>
                    <p className="font-heading text-lg font-bold text-white">
                      {data.next_session.course.title} · {data.next_session.title}
                    </p>
                    <p className="text-sm text-[#DCE3F5]">
                      <LocalDateTime iso={data.next_session.starts_at} /> · {data.next_session.duration_minutes} min
                    </p>
                  </div>
                  <ButtonLink href={`/learn/${data.next_session.course.slug}/live/${data.next_session.id}`} variant="accent">
                    {data.next_session.join_state === "open" ? "Join class" : "View class"}
                  </ButtonLink>
                </Card>
              )}

              {data.pending.map((p) => (
                <Banner
                  key={p.enrollment_id}
                  tone={p.payment_status === "resubmit" || p.payment_status === "rejected" ? "bad" : "warn"}
                  action={
                    <Link href={`/payments/${p.enrollment_id}`} className="shrink-0 font-semibold underline">
                      View
                    </Link>
                  }
                >
                  {p.status === "pending_approval"
                    ? `Your request to join ${p.course.title} is awaiting approval.`
                    : p.payment_status === "pending"
                      ? `Payment for ${p.course.title} is being verified (usually within ${site.payment_review_eta}).`
                      : p.payment_status === "resubmit"
                        ? `Action needed: please upload a new receipt for ${p.course.title}.`
                        : p.payment_status === "rejected"
                          ? `We couldn't verify your payment for ${p.course.title}.`
                          : `Complete your payment to start ${p.course.title}.`}
                </Banner>
              ))}

              <section aria-labelledby="continue">
                <div className="mb-2 flex items-center justify-between">
                  <h2 id="continue" className="text-lg">
                    Continue learning
                  </h2>
                  <Link href="/my-courses" className="text-sm font-medium text-primary">
                    All courses
                  </Link>
                </div>
                {data.continue_learning.length === 0 ? (
                  <EmptyState
                    icon={<BookOpen className="size-6" aria-hidden />}
                    title="You haven't enrolled yet"
                    action={<ButtonLink href="/courses">Browse courses</ButtonLink>}
                  >
                    Browse live and recorded courses from {site.institute_name}.
                  </EmptyState>
                ) : (
                  <div className="flex flex-col gap-3">
                    {data.continue_learning.map((c) => (
                      <Link
                        key={c.course.slug}
                        href={c.next_lesson ? `/learn/${c.course.slug}/lessons/${c.next_lesson.id}` : `/learn/${c.course.slug}`}
                        className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-white p-3 hover:border-primary"
                      >
                        <div className="hidden w-28 shrink-0 overflow-hidden rounded-lg sm:block">
                          <CourseThumb course={{ title: c.course.title, thumbnail_url: c.course.thumbnail_url }} className="h-16" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-heading font-bold">{c.course.title}</span>
                            <span className="text-xs text-muted">{c.progress.percent}%</span>
                          </div>
                          <ProgressBar value={c.progress.percent} label={`${c.course.title} progress`} />
                          <span className="truncate text-xs text-muted">
                            {c.next_lesson ? `Next: ${c.next_lesson.title}` : c.progress.percent === 100 ? "All lessons complete" : "Open course"}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section aria-labelledby="due" className="flex min-w-0 flex-col gap-2">
              <h2 id="due" className="text-lg">
                Due soon
              </h2>
              <Card className="py-1">
                {data.due_soon.length === 0 && <p className="py-3 text-sm text-muted">Nothing due in the next two weeks.</p>}
                {data.due_soon.map((d) => {
                  const days = daysUntil(d.due_at);
                  return (
                    <Link
                      key={d.id}
                      href={`/learn/${d.course.slug}/${d.type === "quiz" ? "quizzes" : "assignments"}/${d.id}`}
                      className="flex items-center gap-3 border-b border-line-soft py-3 last:border-0"
                    >
                      {d.type === "quiz" ? (
                        <FileQuestion className="size-5 shrink-0 text-primary" aria-hidden />
                      ) : (
                        <ClipboardList className="size-5 shrink-0 text-primary" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{d.title}</p>
                        <p className="truncate text-xs text-muted">
                          {d.course.title} · due {formatTime(d.due_at)}
                        </p>
                      </div>
                      <Chip tone={days <= 2 ? "warn" : "mute"}>{days <= 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`}</Chip>
                    </Link>
                  );
                })}
              </Card>
            </section>
          </div>
        )}
      </div>
    </AppPage>
  );
}
