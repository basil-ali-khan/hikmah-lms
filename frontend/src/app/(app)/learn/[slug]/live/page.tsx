"use client";

import { CalendarDays, ChevronRight, Film } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { VideoPlayer } from "@/components/course/video-player";
import { AttendanceChip, AttendanceSummaryCard } from "@/components/learn/attendance";
import { CourseAccessError } from "@/components/learn/access-error";
import { JoinButton, useJoinState } from "@/components/learn/join-button";
import { DualTime, LocalDate } from "@/components/local-time";
import { useSite } from "@/components/providers";
import { Card, Chip, EmptyState, Skeleton } from "@/components/ui";
import { useCourseLive } from "@/lib/queries";
import type { Session } from "@/lib/types";

function UpcomingCard({ session, slug }: { session: Session; slug: string }) {
  const site = useSite();
  const state = useJoinState(session);
  return (
    <Card className="flex flex-col gap-3 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {state === "open" && (
          <Chip tone="accent" className="w-fit">
            Live now
          </Chip>
        )}
        <Link href={`/learn/${slug}/live/${session.id}`} className="font-heading font-bold hover:text-primary">
          {session.title}
        </Link>
        <p className="text-sm text-subtle">
          <DualTime iso={session.starts_at} instituteTz={site.institute_timezone} />
        </p>
        <p className="text-xs text-muted">
          {session.duration_minutes} min{session.platform ? ` · ${session.platform}` : ""}
        </p>
      </div>
      <div className="flex flex-col gap-2 md:w-60">
        {state === "open" && <JoinButton session={session} block />}
        <Link
          href={`/learn/${slug}/live/${session.id}`}
          className="inline-flex min-h-11 items-center justify-center gap-1 text-sm font-medium text-primary"
        >
          Details <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}

function RecordingCard({ session, slug }: { session: Session; slug: string }) {
  return (
    <Card className="flex flex-col gap-3 p-0">
      {session.recording && (
        <div className="overflow-hidden rounded-t-[var(--radius-card)]">
          <VideoPlayer video={session.recording} title={`Recording: ${session.title}`} />
        </div>
      )}
      <div className="flex items-start gap-3 px-4 pb-4 first:pt-4">
        <div className="min-w-0 flex-1">
          <Link href={`/learn/${slug}/live/${session.id}`} className="font-heading font-bold hover:text-primary">
            {session.title}
          </Link>
          <p className="text-xs text-muted">
            <LocalDate iso={session.starts_at} /> · {session.duration_minutes} min
          </p>
          {!session.recording &&
            (session.recording_pending ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                <Film className="size-3.5" aria-hidden /> Recording coming soon
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted">No recording for this class.</p>
            ))}
        </div>
        <AttendanceChip status={session.my_attendance} />
      </div>
    </Card>
  );
}

export default function CourseLivePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, error, refetch } = useCourseLive(slug);

  if (error) return <CourseAccessError error={error} slug={slug} retry={refetch} />;
  if (isLoading || !data)
    return (
      <div className="flex flex-col gap-3" aria-label="Loading live classes">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
      </div>
    );

  const showAttendance = data.min_attendance_percent !== null || data.attendance.total > 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        <section aria-labelledby="upcoming" className="flex flex-col gap-2">
          <h2 id="upcoming" className="text-lg">
            Upcoming
          </h2>
          {data.upcoming.length === 0 ? (
            <EmptyState icon={<CalendarDays className="size-6" aria-hidden />} title="No upcoming classes">
              New live classes will show here once they&apos;re scheduled.
            </EmptyState>
          ) : (
            data.upcoming.map((s) => <UpcomingCard key={s.id} session={s} slug={slug} />)
          )}
        </section>

        <section aria-labelledby="recordings" className="flex flex-col gap-2">
          <h2 id="recordings" className="text-lg">
            Recordings
          </h2>
          {data.past.length === 0 ? (
            <p className="text-sm text-muted">Past classes and their recordings will appear here.</p>
          ) : (
            data.past.map((s) => <RecordingCard key={s.id} session={s} slug={slug} />)
          )}
        </section>
      </div>

      {showAttendance && (
        <div className="lg:order-first lg:col-start-2 lg:row-start-1">
          <AttendanceSummaryCard attendance={data.attendance} minPercent={data.min_attendance_percent} />
        </div>
      )}
    </div>
  );
}
