"use client";

import { CalendarPlus, Film } from "lucide-react";
import { useParams } from "next/navigation";

import { AppPage } from "@/components/app-shell";
import { VideoPlayer } from "@/components/course/video-player";
import { AttendanceChip, AttendanceSummaryCard } from "@/components/learn/attendance";
import { CourseAccessError } from "@/components/learn/access-error";
import { JoinButton, useJoinState } from "@/components/learn/join-button";
import { LocalDateTime } from "@/components/local-time";
import { useSite } from "@/components/providers";
import { Card, Chip, Html, PageHeader, Skeleton } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { useSession } from "@/lib/queries";
import type { Session } from "@/lib/types";

function StateChip({ session }: { session: Session }) {
  const state = useJoinState(session);
  if (state === "open") return <Chip tone="accent">Live now</Chip>;
  if (state === "ended") return <Chip tone="mute">Ended</Chip>;
  return <Chip>Upcoming</Chip>;
}

function SessionActions({ session }: { session: Session }) {
  const state = useJoinState(session);
  if (state === "ended") {
    return (
      <section aria-labelledby="recording" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 id="recording" className="text-base">
            Recording
          </h2>
          <AttendanceChip status={session.my_attendance} />
        </div>
        {session.recording ? (
          <div className="overflow-hidden rounded-xl">
            <VideoPlayer video={session.recording} title={`Recording: ${session.title}`} />
          </div>
        ) : (
          <Card className="flex items-center gap-2 text-sm text-subtle">
            <Film className="size-4 shrink-0" aria-hidden />
            {session.recording_pending ? "Recording coming soon" : "There's no recording for this class."}
          </Card>
        )}
      </section>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <JoinButton session={session} block />
      <a
        href={`/api/v1/live/${session.id}/ics`}
        download
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-primary bg-white px-4 text-[15px] font-medium text-primary hover:bg-primary-soft"
      >
        <CalendarPlus className="size-4" aria-hidden />
        Add to calendar (.ics)
      </a>
    </div>
  );
}

export default function SessionDetailPage() {
  const { slug, sessionId } = useParams<{ slug: string; sessionId: string }>();
  const site = useSite();
  const { data, isLoading, error, refetch } = useSession(sessionId);
  const back = { href: `/learn/${slug}/live`, label: "Live classes" };

  if (error) {
    return (
      <AppPage>
        <PageHeader title="Live session" back={back} />
        <CourseAccessError
          error={error}
          slug={slug}
          retry={refetch}
          notFoundTitle="Session not found"
          backHref={{ href: back.href, label: "Back to live classes" }}
        />
      </AppPage>
    );
  }

  if (isLoading || !data) {
    return (
      <AppPage>
        <PageHeader title="Live session" back={back} />
        <div className="flex flex-col gap-3" aria-label="Loading session">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-40" />
          <Skeleton className="h-12" />
        </div>
      </AppPage>
    );
  }

  const instituteTime = formatDateTime(data.starts_at, site.institute_timezone);
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "When (your time)", value: <LocalDateTime iso={data.starts_at} /> },
    { label: "Institute time", value: instituteTime },
    { label: "Duration", value: `${data.duration_minutes} min` },
    ...(data.platform ? [{ label: "Platform", value: data.platform }] : []),
  ];

  return (
    <AppPage>
      <PageHeader
        back={back}
        title={data.title}
        subtitle={data.course.title}
        actions={<StateChip session={data} />}
      />
      <div className="flex flex-col gap-4">
        <Card className="py-1">
          <dl>
            {rows.map((r) => (
              <div key={r.label} className="flex items-start justify-between gap-4 border-b border-line-soft py-3 last:border-0">
                <dt className="text-sm text-muted">{r.label}</dt>
                <dd className="text-right text-sm font-medium text-ink">{r.value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {data.description_html && <Html html={data.description_html} />}

        <SessionActions session={data} />

        {(data.min_attendance_percent !== null || data.attendance.total > 0) && (
          <AttendanceSummaryCard attendance={data.attendance} minPercent={data.min_attendance_percent} />
        )}
      </div>
    </AppPage>
  );
}
