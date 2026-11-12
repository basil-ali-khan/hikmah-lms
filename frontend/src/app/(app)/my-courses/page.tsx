"use client";

import { BookOpen, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AppPage } from "@/components/app-shell";
import { CourseThumb } from "@/components/course/course-card";
import { LocalDate } from "@/components/local-time";
import { useSite } from "@/components/providers";
import { ButtonLink, Chip, EmptyState, ErrorState, PageHeader, ProgressBar, Skeleton, cn } from "@/components/ui";
import { courseTypeLabel } from "@/lib/format";
import { useMyEnrollments } from "@/lib/queries";
import type { Enrollment } from "@/lib/types";

type Tab = "active" | "pending" | "completed";

function tabOf(e: Enrollment): Tab | null {
  if (e.status === "pending_approval" || e.status === "pending_payment" || e.status === "rejected") return "pending";
  if (e.completed_at && (e.status === "active" || e.status === "expired")) return "completed";
  if (e.status === "active" || e.status === "expired" || e.status === "revoked") return "active";
  return null;
}

function pendingLabel(e: Enrollment): { text: string; tone: "warn" | "bad" | "mute" } {
  if (e.status === "rejected") return { text: "Not approved", tone: "bad" };
  if (e.status === "pending_approval") return { text: "Awaiting approval", tone: "warn" };
  switch (e.latest_payment?.status) {
    case "pending":
      return { text: "Payment being verified", tone: "warn" };
    case "resubmit":
      return { text: "Upload a new receipt", tone: "bad" };
    case "rejected":
      return { text: "Payment not verified", tone: "bad" };
    default:
      return { text: "Payment needed", tone: "warn" };
  }
}

function AccessLine({ e }: { e: Enrollment }) {
  return e.expires_at ? (
    <>
      access until <LocalDate iso={e.expires_at} />
    </>
  ) : (
    <>lifetime access</>
  );
}

const cardCls = "flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-white p-3";

function EnrollmentCard({ e }: { e: Enrollment }) {
  const thumb = (
    <div className="w-20 shrink-0 overflow-hidden rounded-lg sm:w-28">
      <CourseThumb course={e.course} className="h-14 sm:h-16" />
    </div>
  );

  if (e.status === "expired" || e.status === "revoked") {
    return (
      <div className={cn(cardCls, "bg-[#FBFCFD]")}>
        <div className="opacity-60">{thumb}</div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-heading font-bold text-subtle">{e.course.title}</span>
          <Chip tone="mute" className="w-fit">
            {e.status === "expired" ? "Access expired" : "Access removed"}
          </Chip>
          <span className="text-xs text-muted">Contact the institute to {e.status === "expired" ? "extend" : "restore"} access.</span>
        </div>
      </div>
    );
  }

  if (tabOf(e) === "pending") {
    const label = pendingLabel(e);
    return (
      <Link href={`/payments/${e.id}`} className={cn(cardCls, "hover:border-primary")}>
        {thumb}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-heading font-bold">{e.course.title}</span>
          <Chip tone={label.tone} className="w-fit">
            {label.text}
          </Chip>
          <span className="text-xs text-muted">
            Requested <LocalDate iso={e.created_at} />
          </span>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
      </Link>
    );
  }

  const percent = e.progress?.percent ?? 0;
  return (
    <Link href={`/learn/${e.course.slug}`} className={cn(cardCls, "hover:border-primary")}>
      {thumb}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-heading font-bold">{e.course.title}</span>
          {e.completed_at ? <Chip tone="ok">Completed</Chip> : <Chip tone="mute">{courseTypeLabel[e.course.course_type]}</Chip>}
        </div>
        <ProgressBar value={percent} tone={e.completed_at ? "ok" : "primary"} label={`${e.course.title} progress`} />
        <span className="truncate text-xs text-muted">
          {percent}% · <AccessLine e={e} />
        </span>
      </div>
    </Link>
  );
}

export default function MyCoursesPage() {
  const site = useSite();
  const { data, isLoading, error, refetch } = useMyEnrollments();
  const [tab, setTab] = useState<Tab>("active");

  const groups: Record<Tab, Enrollment[]> = { active: [], pending: [], completed: [] };
  for (const e of data ?? []) {
    const t = tabOf(e);
    if (t) groups[t].push(e);
  }
  // Counts exclude expired/removed cards, which stay listed under Active for context.
  const counts: Record<Tab, number> = {
    active: groups.active.filter((e) => e.status === "active").length,
    pending: groups.pending.length,
    completed: groups.completed.length,
  };
  const tabs: { id: Tab; label: string }[] = [
    { id: "active", label: "Active" },
    { id: "pending", label: "Pending" },
    { id: "completed", label: "Completed" },
  ];
  const list = groups[tab];

  return (
    <AppPage>
      <PageHeader title="My courses" />
      <div role="tablist" aria-label="Course status" className="mb-4 flex gap-1 rounded-xl bg-[#EEF0F3] p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="my-courses-panel"
            onClick={() => setTab(t.id)}
            className={cn(
              "min-h-11 flex-1 rounded-lg px-2 text-sm font-medium text-subtle",
              tab === t.id && "bg-white font-bold text-primary shadow-sm",
            )}
          >
            {t.label}
            {data && counts[t.id] > 0 ? ` (${counts[t.id]})` : ""}
          </button>
        ))}
      </div>

      <div id="my-courses-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="flex flex-col gap-3">
        {isLoading && (
          <div className="flex flex-col gap-3" aria-label="Loading your courses">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        )}
        {error && <ErrorState error={error} retry={refetch} />}
        {data && list.length === 0 && (
          <EmptyState
            icon={<BookOpen className="size-6" aria-hidden />}
            title={
              tab === "active" ? "You haven't enrolled yet" : tab === "pending" ? "Nothing pending" : "No completed courses yet"
            }
            action={tab === "active" ? <ButtonLink href="/courses">Browse courses</ButtonLink> : undefined}
          >
            {tab === "active"
              ? `Browse live and recorded courses from ${site.institute_name}.`
              : tab === "pending"
                ? "Courses waiting for approval or payment verification will show here."
                : "Courses you finish will show here, with your certificate."}
          </EmptyState>
        )}
        {list.map((e) => (
          <EnrollmentCard key={e.id} e={e} />
        ))}
        {tab === "pending" && list.length > 0 && (
          <p className="text-xs text-muted">Tap a course to see its approval or payment status.</p>
        )}
      </div>
    </AppPage>
  );
}
