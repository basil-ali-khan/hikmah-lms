"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, FileText, ListTree, Lock, Paperclip } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { AppPage } from "@/components/app-shell";
import { CourseAccessError } from "@/components/learn/access-error";
import { CourseOutline } from "@/components/learn/outline";
import { LocalDateTime } from "@/components/local-time";
import { VideoPlayer } from "@/components/course/video-player";
import { Banner, Button, ButtonLink, Card, Html, PageHeader, ProgressBar, Skeleton } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage, openSignedFile } from "@/lib/api";
import { fileSize } from "@/lib/format";
import { keys, useLearn, useLesson } from "@/lib/queries";
import type { LearnCourse, Lesson, LockReason, Progress } from "@/lib/types";

/** "Lesson i of n" within the lesson's module when the outline is loaded; course-wide otherwise. */
function positionLabel(lesson: Lesson, learn: LearnCourse | undefined) {
  const mod = learn?.outline.modules.find((m) => m.id === lesson.module.id);
  const lessons = mod?.items.filter((i) => i.type === "lesson") ?? [];
  const idx = lessons.findIndex((i) => i.id === lesson.id);
  if (mod && idx >= 0) return `${lesson.module.title} · Lesson ${idx + 1} of ${lessons.length}`;
  return `${lesson.module.title} · Lesson ${lesson.position.index} of ${lesson.position.total}`;
}

function LockedLesson({ reason, slug }: { reason: LockReason; slug: string }) {
  return (
    <Card className="flex flex-col items-start gap-3 py-6">
      <div className="flex size-12 items-center justify-center rounded-full bg-[#EEF0F3] text-subtle">
        <Lock className="size-6" aria-hidden />
      </div>
      <h2 className="text-lg">Not available yet</h2>
      {reason?.code === "not_released" && reason.release_at ? (
        <p className="text-sm text-subtle">
          Opens <LocalDateTime iso={reason.release_at} /> (your time)
        </p>
      ) : (
        <p className="text-sm text-subtle">{reason?.message ?? "This lesson is locked."}</p>
      )}
      {reason?.code === "prerequisite" && reason.lesson_id && (
        <ButtonLink href={`/learn/${slug}/lessons/${reason.lesson_id}`}>Go to {reason.title ?? "the lesson"}</ButtonLink>
      )}
      {reason?.code === "quiz_score" && reason.quiz_id && (
        <ButtonLink href={`/learn/${slug}/quizzes/${reason.quiz_id}`}>Go to {reason.title ?? "the quiz"}</ButtonLink>
      )}
      <Link href={`/learn/${slug}`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
        Back to course content
      </Link>
    </Card>
  );
}

export default function LessonPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: lesson, isLoading, error, refetch } = useLesson(id);
  const { data: learn } = useLearn(slug);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [opening, setOpening] = useState(false);

  const complete = useMutation({
    mutationFn: () => api.post<{ completed: boolean; progress: Progress }>(`/api/v1/lessons/${id}/complete`),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.lesson(id) }),
        qc.invalidateQueries({ queryKey: keys.learn(slug) }),
        qc.invalidateQueries({ queryKey: keys.grades(slug) }),
        qc.invalidateQueries({ queryKey: keys.dashboard }),
        qc.invalidateQueries({ queryKey: keys.enrollments }),
      ]);
      toast(lesson?.next_id ? "Lesson complete — on to the next one." : "Lesson complete.");
    },
    onError: (err) => toast(errorMessage(err), "error"),
  });

  async function openFile() {
    setOpening(true);
    try {
      await openSignedFile(`/api/v1/lessons/${id}/file`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setOpening(false);
    }
  }

  if (error) {
    return (
      <AppPage>
        <PageHeader title="Lesson" back={{ href: `/learn/${slug}`, label: "Course" }} />
        <CourseAccessError error={error} slug={slug} retry={refetch} notFoundTitle="Lesson not found" />
      </AppPage>
    );
  }

  const progress = learn?.outline.progress;
  const outline = learn ? (
    <CourseOutline slug={slug} outline={learn.outline} currentId={id} variant="compact" onNavigate={() => setSheetOpen(false)} />
  ) : (
    <div className="flex flex-col gap-2 py-2">
      <Skeleton className="h-10" />
      <Skeleton className="h-10" />
      <Skeleton className="h-10" />
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl md:px-8 md:py-6">
      {/* Mobile top bar */}
      <div className="flex items-center gap-1 border-b border-line-soft bg-white px-2 py-1 md:hidden">
        <Link href={`/learn/${slug}`} aria-label="Back to course" className="flex size-11 shrink-0 items-center justify-center rounded-[10px]">
          <ArrowLeft className="size-5 text-heading" aria-hidden />
        </Link>
        <span className="min-w-0 flex-1 truncate font-heading text-[15px] font-bold">{lesson?.title ?? learn?.course.title ?? ""}</span>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Course content"
          className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-[#F2F4F7]"
        >
          <ListTree className="size-5 text-heading" aria-hidden />
        </button>
      </div>

      {/* Desktop header */}
      <div className="mb-4 hidden items-center justify-between gap-4 md:flex">
        <Link href={`/learn/${slug}`} className="inline-flex min-h-9 min-w-0 items-center gap-1.5 text-sm font-medium text-primary">
          <ArrowLeft className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{learn?.course.title ?? lesson?.course.title ?? "Course"}</span>
        </Link>
        {progress && (
          <div className="flex w-56 shrink-0 items-center gap-2">
            <ProgressBar value={progress.percent} label="Course progress" />
            <span className="text-xs whitespace-nowrap text-muted">{progress.percent}% complete</span>
          </div>
        )}
      </div>

      <div className="md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:gap-6">
        <article className="min-w-0">
          {isLoading || !lesson ? (
            <div aria-label="Loading lesson">
              <Skeleton className="aspect-video w-full rounded-none md:rounded-xl" />
              <div className="flex flex-col gap-3 px-4 py-4 md:px-0">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-7 w-3/4" />
                <Skeleton className="h-24" />
              </div>
            </div>
          ) : (
            <>
              {lesson.available && lesson.kind === "video" && lesson.video && (
                <div className="overflow-hidden bg-ink md:rounded-xl">
                  <VideoPlayer video={lesson.video} title={lesson.title} />
                </div>
              )}
              <div className="flex flex-col gap-4 px-4 py-4 md:px-0 md:py-5">
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted">{positionLabel(lesson, learn)}</p>
                  <h1 className="text-[22px] leading-tight md:text-[26px]">{lesson.title}</h1>
                </div>

                {!lesson.available ? (
                  <LockedLesson reason={lesson.lock_reason} slug={slug} />
                ) : (
                  <>
                    {lesson.completed && (
                      <Banner tone="ok">You&apos;ve completed this lesson.</Banner>
                    )}

                    {lesson.kind === "pdf" && lesson.file && (
                      <Card className="flex items-center gap-3">
                        <FileText className="size-8 shrink-0 text-primary" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{lesson.file.name}</p>
                          <p className="text-xs text-muted">PDF · {fileSize(lesson.file.size)}</p>
                        </div>
                        <Button onClick={openFile} loading={opening}>
                          Open PDF
                        </Button>
                      </Card>
                    )}

                    {lesson.body_html && <Html html={lesson.body_html} />}

                    {lesson.kind !== "pdf" && lesson.file && (
                      <section aria-labelledby="resources" className="flex flex-col gap-2">
                        <h2 id="resources" className="text-base">
                          Resources
                        </h2>
                        <div className="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
                          <Paperclip className="size-5 shrink-0 text-muted" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{lesson.file.name}</p>
                            <p className="text-xs text-muted">{fileSize(lesson.file.size)}</p>
                          </div>
                          <Button variant="ghost" size="sm" className="min-h-11" onClick={openFile} loading={opening} aria-label={`Open ${lesson.file.name}`}>
                            Open
                          </Button>
                        </div>
                      </section>
                    )}

                    {!lesson.completed ? (
                      <Button block onClick={() => complete.mutate()} loading={complete.isPending}>
                        <CheckCircle2 className="size-5" aria-hidden />
                        Mark as complete
                      </Button>
                    ) : (
                      lesson.next_id && (
                        <ButtonLink href={`/learn/${slug}/lessons/${lesson.next_id}`} block>
                          Next lesson
                          <ChevronRight className="size-5" aria-hidden />
                        </ButtonLink>
                      )
                    )}
                  </>
                )}

                <nav aria-label="Lesson navigation" className="flex gap-2">
                  {lesson.previous_id ? (
                    <ButtonLink href={`/learn/${slug}/lessons/${lesson.previous_id}`} variant="outline" className="flex-1">
                      <ChevronLeft className="size-5" aria-hidden /> Previous
                    </ButtonLink>
                  ) : (
                    <Button variant="outline" className="flex-1" disabled>
                      <ChevronLeft className="size-5" aria-hidden /> Previous
                    </Button>
                  )}
                  {lesson.next_id ? (
                    <ButtonLink href={`/learn/${slug}/lessons/${lesson.next_id}`} variant="outline" className="flex-1">
                      Next <ChevronRight className="size-5" aria-hidden />
                    </ButtonLink>
                  ) : (
                    <Button variant="outline" className="flex-1" disabled>
                      Next <ChevronRight className="size-5" aria-hidden />
                    </Button>
                  )}
                </nav>
              </div>
            </>
          )}
        </article>

        <aside aria-labelledby="outline-heading" className="hidden md:block">
          <Card className="sticky top-20 flex max-h-[calc(100dvh-6rem)] flex-col gap-2 overflow-y-auto">
            <h2 id="outline-heading" className="text-base">
              Course content
            </h2>
            {progress && <ProgressBar value={progress.percent} label="Course progress" />}
            {outline}
          </Card>
        </aside>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="Course content">
        {progress && (
          <div className="mb-1">
            <ProgressBar value={progress.percent} label="Course progress" />
          </div>
        )}
        {outline}
      </Sheet>
    </div>
  );
}
