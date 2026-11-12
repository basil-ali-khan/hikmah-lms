"use client";

import { CalendarDays, CalendarPlus, Globe } from "lucide-react";
import Link from "next/link";

import { AppPage } from "@/components/app-shell";
import { JoinButton, useJoinState } from "@/components/learn/join-button";
import { DualTime } from "@/components/local-time";
import { useSite } from "@/components/providers";
import { ButtonLink, Card, Chip, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { dayHeading, formatTime, relativeTime, userTimeZone } from "@/lib/format";
import { useSchedule } from "@/lib/queries";
import type { Session } from "@/lib/types";

const detailHref = (s: Session) => `/learn/${s.course.slug}/live/${s.id}`;

function NextSessionCard({ session }: { session: Session }) {
  const site = useSite();
  const state = useJoinState(session);
  return (
    <Card className="flex flex-col gap-2 border-0 bg-primary text-white md:flex-row md:items-center md:gap-5">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="accent">{state === "open" ? "Live now" : `Starts ${relativeTime(session.starts_at)}`}</Chip>
          <span className="text-xs text-[#DCE3F5]">{session.duration_minutes} min</span>
        </div>
        <Link href={detailHref(session)} className="font-heading text-lg font-bold text-white hover:underline">
          {session.course.title} · {session.title}
        </Link>
        <p className="text-sm text-[#DCE3F5] [&_.text-muted]:text-[#DCE3F5]">
          <DualTime iso={session.starts_at} instituteTz={site.institute_timezone} />
        </p>
      </div>
      <div className="flex flex-col gap-2 md:w-60">
        {state === "open" ? (
          <JoinButton session={session} variant="accent" block />
        ) : (
          <ButtonLink href={detailHref(session)} variant="accent" block>
            View class
          </ButtonLink>
        )}
      </div>
    </Card>
  );
}

function SessionRow({ session }: { session: Session }) {
  const state = useJoinState(session);
  return (
    <li className="flex flex-col gap-2 border-b border-line-soft py-3 last:border-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link href={detailHref(session)} className="text-sm font-medium hover:text-primary">
            {session.course.title} · {session.title}
          </Link>
          <p className="text-xs text-muted">
            {formatTime(session.starts_at)} · {session.duration_minutes} min
          </p>
        </div>
        {state === "open" && <Chip tone="accent">Live now</Chip>}
      </div>
      <div className="flex flex-wrap gap-2">
        {state === "open" && <JoinButton session={session} className="flex-1" />}
        <a
          href={`/api/v1/live/${session.id}/ics`}
          download
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary-soft"
        >
          <CalendarPlus className="size-4" aria-hidden /> Add to calendar
        </a>
        <Link
          href={detailHref(session)}
          className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary-soft"
        >
          Details
        </Link>
      </div>
    </li>
  );
}

export default function SchedulePage() {
  const { data, isLoading, error, refetch } = useSchedule();

  const [first, ...rest] = data ?? [];
  const groups: { day: string; sessions: Session[] }[] = [];
  for (const s of rest) {
    const day = dayHeading(s.starts_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.sessions.push(s);
    else groups.push({ day, sessions: [s] });
  }

  return (
    <AppPage>
      <PageHeader
        title="Schedule"
        actions={
          <Chip tone="mute" className="h-8 gap-1.5">
            <Globe className="size-3.5" aria-hidden />
            Your time zone: {userTimeZone()}
          </Chip>
        }
      />
      <div className="flex flex-col gap-4">
        {isLoading && (
          <div className="flex flex-col gap-3" aria-label="Loading schedule">
            <Skeleton className="h-32" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        )}
        {error && <ErrorState error={error} retry={refetch} />}
        {data && data.length === 0 && (
          <EmptyState
            icon={<CalendarDays className="size-6" aria-hidden />}
            title="No upcoming classes"
            action={
              <ButtonLink href="/my-courses" variant="outline">
                My courses
              </ButtonLink>
            }
          >
            Live classes from all your courses will show here.
          </EmptyState>
        )}
        {first && (
          <section aria-labelledby="day-next" className="flex flex-col gap-2">
            <h2 id="day-next" className="text-sm font-bold text-subtle">
              {dayHeading(first.starts_at)}
            </h2>
            <NextSessionCard session={first} />
          </section>
        )}
        {groups.map((g, i) => (
          <section key={g.day} aria-labelledby={`day-${i}`} className="flex flex-col gap-2">
            <h2 id={`day-${i}`} className="text-sm font-bold text-subtle">
              {g.day}
            </h2>
            <Card className="py-0">
              <ul>
                {g.sessions.map((s) => (
                  <SessionRow key={s.id} session={s} />
                ))}
              </ul>
            </Card>
          </section>
        ))}
      </div>
    </AppPage>
  );
}
