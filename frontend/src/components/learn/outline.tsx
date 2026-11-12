"use client";

import { CheckCircle2, Circle, ClipboardList, FileQuestion, Lock, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { LocalDate } from "@/components/local-time";
import { Chip, cn } from "@/components/ui";
import type { Outline, OutlineItem } from "@/lib/types";

export const lessonKindLabel = { video: "Video", pdf: "PDF", text: "Reading", file: "File" } as const;

export function itemHref(slug: string, item: Pick<OutlineItem, "type" | "id">) {
  const segment = item.type === "lesson" ? "lessons" : item.type === "quiz" ? "quizzes" : "assignments";
  return `/learn/${slug}/${segment}/${item.id}`;
}

type Status = "done" | "locked" | "current" | "todo";

function itemStatus(item: OutlineItem, highlightId?: string | null): Status {
  if (item.completed) return "done";
  if (item.locked) return "locked";
  if (highlightId && item.id === highlightId) return "current";
  return "todo";
}

const statusText: Record<Status, string> = { done: "Completed", locked: "Locked", current: "Up next", todo: "Not started" };

function StatusIcon({ status, type }: { status: Status; type: OutlineItem["type"] }) {
  const cls = "size-5 shrink-0";
  let icon: React.ReactNode;
  if (status === "done") icon = <CheckCircle2 className={cn(cls, "text-ok")} aria-hidden />;
  else if (status === "locked") icon = <Lock className={cn(cls, "text-muted")} aria-hidden />;
  else if (status === "current") icon = <PlayCircle className={cn(cls, "text-primary")} aria-hidden />;
  else if (type === "quiz") icon = <FileQuestion className={cn(cls, "text-muted")} aria-hidden />;
  else if (type === "assignment") icon = <ClipboardList className={cn(cls, "text-muted")} aria-hidden />;
  else icon = <Circle className={cn(cls, "text-[#9AA3AE]")} aria-hidden />;
  return (
    <>
      {icon}
      <span className="sr-only">{statusText[status]}: </span>
    </>
  );
}

/** Secondary line for an item: kind/duration, lock reason, score or due date. */
function ItemMeta({ item, moduleReleaseAt }: { item: OutlineItem; moduleReleaseAt: string | null }) {
  const reason = item.lock_reason;
  if (item.locked) {
    const releaseAt = reason?.code === "not_released" ? reason.release_at : moduleReleaseAt;
    if (releaseAt)
      return (
        <>
          Opens <LocalDate iso={releaseAt} />
        </>
      );
    if (reason?.code === "prerequisite") return <>Requires {reason.title}</>;
    if (reason?.code === "quiz_score") return <>Needs {reason.min_percent}% in {reason.title}</>;
    return <>{reason?.message ?? "Locked"}</>;
  }
  if (item.type === "lesson") {
    const kind = item.kind ? lessonKindLabel[item.kind] : "Lesson";
    return <>{item.duration_minutes ? `${kind} · ${item.duration_minutes} min` : kind}</>;
  }
  if (item.type === "quiz") {
    if (item.best_percent !== null && item.best_percent !== undefined) return <>Quiz · best {Math.round(item.best_percent)}%</>;
    if (item.closes_at)
      return (
        <>
          Quiz · closes <LocalDate iso={item.closes_at} />
        </>
      );
    return <>Quiz</>;
  }
  switch (item.submission_status) {
    case "submitted":
      return <>Assignment · awaiting grade</>;
    case "graded":
      return <>Assignment · graded</>;
    case "resubmit":
      return <>Assignment · resubmission requested</>;
    default:
      return item.due_at ? (
        <>
          Assignment · due <LocalDate iso={item.due_at} />
        </>
      ) : (
        <>Assignment</>
      );
  }
}

function ItemChip({ item, upNext }: { item: OutlineItem; upNext: boolean }) {
  if (item.type === "quiz" && item.passed) return <Chip tone="ok">Passed</Chip>;
  if (item.type === "assignment" && item.submission_status === "resubmit") return <Chip tone="warn">Resubmit</Chip>;
  if (item.type === "assignment" && item.submission_status === "graded")
    return item.completed ? <Chip tone="ok">Passed</Chip> : <Chip tone="mute">Graded</Chip>;
  if (upNext) return <Chip>Up next</Chip>;
  return null;
}

/**
 * Course outline: modules → lessons, quizzes and assignments with done/todo/current/locked state.
 * "full" is the course home list; "compact" is the player sidebar / bottom sheet (highlights the open lesson).
 */
export function CourseOutline({
  slug,
  outline,
  nextLessonId,
  currentId,
  variant = "full",
  onNavigate,
}: {
  slug: string;
  outline: Outline;
  nextLessonId?: string | null;
  currentId?: string | null;
  variant?: "full" | "compact";
  onNavigate?: () => void;
}) {
  const compact = variant === "compact";
  const uid = useId();
  const highlightId = currentId ?? nextLessonId;

  if (outline.modules.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">Course content will appear here once it&apos;s published.</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {outline.modules.map((module) => {
        const headingId = `${uid}-module-${module.id}`;
        return (
          <section key={module.id} aria-labelledby={headingId} className={compact ? "mt-2" : "mt-3"}>
            <h3
              id={headingId}
              className={cn(
                "flex items-center justify-between gap-2 py-2 text-xs font-bold tracking-wide text-subtle uppercase",
                !compact && "border-b border-line-soft",
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {module.locked && <Lock className="size-3.5 shrink-0" aria-hidden />}
                <span className="truncate">{module.title}</span>
              </span>
              <span className="shrink-0 font-medium normal-case">
                {module.locked && module.release_at ? (
                  <>
                    Opens <LocalDate iso={module.release_at} />
                  </>
                ) : (
                  `${module.completed_count}/${module.items.length}`
                )}
              </span>
            </h3>
            {module.items.length === 0 ? (
              <p className="py-2 text-sm text-muted">Nothing here yet.</p>
            ) : (
              <ul className="flex flex-col">
                {module.items.map((item) => {
                  const status = itemStatus(item, highlightId);
                  const isCurrent = !!currentId && item.id === currentId;
                  const upNext = !compact && !!nextLessonId && item.id === nextLessonId && !item.completed;
                  // Items inside an unreleased module can't be opened; individually locked lessons still link to
                  // their page, which explains how to unlock them.
                  const linkable = !(item.locked && module.locked);
                  const body = (
                    <>
                      <StatusIcon status={isCurrent && !item.completed ? "current" : status} type={item.type} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={cn("text-sm leading-snug text-ink", isCurrent && "font-bold text-primary")}>
                          {item.title}
                        </span>
                        {!compact && (
                          <span className="text-xs text-muted">
                            <ItemMeta item={item} moduleReleaseAt={module.release_at} />
                          </span>
                        )}
                        {compact && item.locked && (
                          <span className="text-xs text-muted">
                            <ItemMeta item={item} moduleReleaseAt={module.release_at} />
                          </span>
                        )}
                      </span>
                      {!compact && <ItemChip item={item} upNext={upNext} />}
                      {compact && item.type === "quiz" && item.best_percent != null && (
                        <span className="text-xs text-muted">{Math.round(item.best_percent)}%</span>
                      )}
                    </>
                  );
                  const rowCls = cn(
                    "flex min-h-12 items-center gap-3 py-2.5",
                    compact ? "-mx-4 px-4" : "border-b border-line-soft last:border-0",
                    isCurrent && "bg-primary-soft",
                  );
                  return (
                    <li key={`${item.type}-${item.id}`}>
                      {linkable ? (
                        <Link
                          href={itemHref(slug, item)}
                          onClick={onNavigate}
                          aria-current={isCurrent ? "page" : undefined}
                          className={cn(rowCls, "hover:bg-primary-soft", !compact && "-mx-2 rounded-lg px-2")}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className={cn(rowCls, "opacity-80", !compact && "-mx-2 px-2")} aria-disabled="true">
                          {body}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
