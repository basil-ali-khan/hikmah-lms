"use client";

import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { AttendanceSummaryCard } from "@/components/learn/attendance";
import { CourseAccessError } from "@/components/learn/access-error";
import { Card, Chip, Skeleton } from "@/components/ui";
import { useGrades } from "@/lib/queries";
import type { Grades } from "@/lib/types";

type Row = { key: string; href: string; title: string; meta: string; score: string; chip: React.ReactNode };

const num = (v: string | number) => {
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : String(v);
};

function quizChip(q: Grades["quizzes"][number]) {
  if (q.needs_grading) return <Chip tone="mute">Awaiting grading</Chip>;
  if (q.passed) return <Chip tone="ok">Passed</Chip>;
  if (q.attempts_used === 0) return <Chip tone="mute">Not attempted</Chip>;
  if (q.in_progress_attempt && q.best_percent === null) return <Chip tone="primary">In progress</Chip>;
  return <Chip tone="warn">Not yet</Chip>;
}

function assignmentChip(a: Grades["assignments"][number]) {
  switch (a.status) {
    case "graded":
      return a.passed ? <Chip tone="ok">Passed</Chip> : <Chip tone="warn">Not passed</Chip>;
    case "submitted":
      return <Chip tone="mute">Awaiting grading</Chip>;
    case "resubmit":
      return <Chip tone="warn">Resubmit</Chip>;
    default:
      return <Chip tone="mute">Not submitted</Chip>;
  }
}

function GradeList({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
  const id = `grades-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-lg">
        {title}
      </h2>
      <Card className="py-1">
        {rows.length === 0 && <p className="py-3 text-sm text-muted">{empty}</p>}
        <ul>
          {rows.map((r) => (
            <li key={r.key} className="border-b border-line-soft last:border-0">
              <Link href={r.href} className="-mx-2 flex min-h-14 items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-primary-soft">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <p className="text-xs text-muted">{r.meta}</p>
                </div>
                <span className="text-sm font-bold text-ink">{r.score}</span>
                {r.chip}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

export default function GradesPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, error, refetch } = useGrades(slug);

  if (error) return <CourseAccessError error={error} slug={slug} retry={refetch} />;
  if (isLoading || !data)
    return (
      <div className="flex flex-col gap-3" aria-label="Loading grades">
        <Skeleton className="h-36" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );

  const { completion } = data;
  const quizRows: Row[] = data.quizzes.map((q) => ({
    key: q.id,
    href: `/learn/${slug}/quizzes/${q.id}`,
    title: q.title,
    meta: `${q.required ? "Required" : "Optional"} · pass mark ${q.pass_percent}%`,
    score: q.best_percent !== null ? `${Math.round(q.best_percent)}%` : "—",
    chip: quizChip(q),
  }));
  const assignmentRows: Row[] = data.assignments.map((a) => ({
    key: a.id,
    href: `/learn/${slug}/assignments/${a.id}`,
    title: a.title,
    meta: `${a.required ? "Required" : "Optional"} · pass ${num(a.pass_score)}/${num(a.max_score)}`,
    score: a.score !== null ? `${num(a.score)}/${num(a.max_score)}` : "—",
    chip: assignmentChip(a),
  }));

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <GradeList title="Quizzes" rows={quizRows} empty="This course has no quizzes." />
        <GradeList title="Assignments" rows={assignmentRows} empty="This course has no assignments." />
      </div>

      <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1">
        <Card className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base">{completion.issues_certificate ? "Certificate requirements" : "Completion requirements"}</h2>
            {completion.complete && <Chip tone="ok">Complete</Chip>}
          </div>
          {completion.requirements.length === 0 ? (
            <p className="text-sm text-muted">No completion requirements are set for this course.</p>
          ) : (
            <ul className="flex flex-col">
              {completion.requirements.map((r) => (
                <li key={r.key} className="flex items-center gap-2.5 border-b border-line-soft py-2.5 last:border-0">
                  {r.met ? (
                    <CheckCircle2 className="size-5 shrink-0 text-ok" aria-hidden />
                  ) : (
                    <Circle className="size-5 shrink-0 text-[#9AA3AE]" aria-hidden />
                  )}
                  <span className="sr-only">{r.met ? "Met: " : "Not met yet: "}</span>
                  <span className="flex-1 text-sm">{r.label}</span>
                  <span className={r.met ? "text-sm font-bold text-ok" : "text-sm font-medium text-ink"}>{r.progress}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {data.attendance.total > 0 && <AttendanceSummaryCard attendance={data.attendance} minPercent={null} />}
      </div>
    </div>
  );
}
