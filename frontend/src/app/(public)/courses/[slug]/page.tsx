import { Award, CalendarDays, ChevronDown, Clock, Infinity as InfinityIcon, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseThumb } from "@/components/course/course-card";
import { VideoPlayer } from "@/components/course/video-player";
import { DualTime, LocalDate, LocalDateTime } from "@/components/local-time";
import { EnrollCta } from "@/components/public/enroll-cta";
import { Html } from "@/components/ui";
import { accessLabel, courseTypeLabel } from "@/lib/format";
import { getSiteConfig, serverGet } from "@/lib/site-config";
import type { CourseDetail } from "@/lib/types";

type Params = Promise<{ slug: string }>;

async function loadCourse(slug: string) {
  const { status, data } = await serverGet<CourseDetail>(`/api/v1/courses/${encodeURIComponent(slug)}`);
  if (status === 404 || (!data && status < 500)) notFound();
  if (!data) throw new Error("The course couldn't be loaded. Please try again.");
  return data;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const [{ data }, site] = await Promise.all([
    serverGet<CourseDetail>(`/api/v1/courses/${encodeURIComponent(slug)}`),
    getSiteConfig(),
  ]);
  if (!data) return { title: "Course not found", robots: { index: false } };
  const description = data.summary || `${courseTypeLabel[data.course_type]} course`;
  return {
    title: data.title,
    description,
    alternates: { canonical: `/courses/${data.slug}` },
    openGraph: {
      title: data.title,
      description,
      type: "website",
      siteName: site.institute_name,
      url: `/courses/${data.slug}`,
      images: data.thumbnail_url ? [{ url: data.thumbnail_url, alt: data.title }] : undefined,
    },
    twitter: { card: data.thumbnail_url ? "summary_large_image" : "summary", title: data.title, description },
  };
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-line-soft py-3 last:border-0">
      <span className="mt-0.5 text-primary" aria-hidden>
        {icon}
      </span>
      <dt className="w-20 shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

/** Server-side "is this in the future" (rendered per request; the course API is revalidated every minute). */
function isFuture(iso: string | null): iso is string {
  return !!iso && new Date(iso).getTime() > Date.now();
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export default async function CourseDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [course, site] = await Promise.all([loadCourse(slug), getSiteConfig()]);
  const tz = site.institute_timezone;

  const facts = (
    <dl>
      {(course.schedule_label || course.starts_at) && (
        <Row icon={<CalendarDays className="size-4" />} label="Schedule">
          {course.schedule_label && <p>{course.schedule_label}</p>}
          {course.starts_at && (
            <p className={course.schedule_label ? "text-subtle" : undefined}>
              {isFuture(course.starts_at) ? "Starts" : "Started"} <DualTime iso={course.starts_at} instituteTz={tz} />
            </p>
          )}
          {course.ends_at && (
            <p className="text-subtle">
              Ends <LocalDate iso={course.ends_at} />
            </p>
          )}
        </Row>
      )}
      {course.duration_label && (
        <Row icon={<Clock className="size-4" />} label="Duration">
          {course.duration_label}
        </Row>
      )}
      <Row icon={<InfinityIcon className="size-4" />} label="Access">
        {accessLabel(course)}
      </Row>
      {course.capacity !== null && course.seats_left !== null && (
        <Row icon={<Users className="size-4" />} label="Seats">
          {course.seats_left === 0 ? "Full" : `${course.seats_left} of ${course.capacity} left`}
        </Row>
      )}
      {isFuture(course.enrollment_closes_at) && (
        <Row icon={<CalendarDays className="size-4" />} label="Enroll by">
          <LocalDateTime iso={course.enrollment_closes_at} />
        </Row>
      )}
      {course.eligibility && (
        <Row icon={<ShieldCheck className="size-4" />} label="Open to">
          {course.eligibility}
        </Row>
      )}
    </dl>
  );

  const ctaCourse = {
    title: course.title,
    is_free: course.is_free,
    price: course.price,
    currency: course.currency,
    enrollment_mode: course.enrollment_mode,
    enrollment_opens_at: course.enrollment_opens_at,
    eligibility: course.eligibility,
  };

  const requirements = [
    course.completion.lessons && "complete all lessons",
    course.completion.quizzes && "pass the required quizzes",
    course.completion.assignments && "pass the required assignments",
    course.completion.min_attendance_percent && `attend at least ${course.completion.min_attendance_percent}% of live classes`,
  ].filter(Boolean) as string[];

  return (
    <>
      <div className="mx-auto max-w-6xl md:px-8 md:py-10">
        <nav aria-label="Breadcrumb" className="hidden pb-4 text-sm text-muted md:block">
          <Link href="/courses" className="text-primary hover:underline">
            Courses
          </Link>
          {course.category && (
            <>
              {" / "}
              <Link href={`/courses?category=${course.category.slug}`} className="text-primary hover:underline">
                {course.category.name}
              </Link>
            </>
          )}
        </nav>

        <div className="md:grid md:grid-cols-[1fr_360px] md:gap-10">
          <article className="flex min-w-0 flex-col gap-6">
            <div className="overflow-hidden md:hidden">
              {course.intro_video ? (
                <VideoPlayer video={course.intro_video} title={`${course.title} introduction`} />
              ) : (
                <CourseThumb course={course} className="aspect-video h-auto" />
              )}
            </div>

            <header className="flex flex-col gap-3 px-4 md:px-0">
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex h-6 items-center rounded-full bg-primary-soft px-2.5 text-xs font-medium text-primary">
                  {courseTypeLabel[course.course_type]}
                </span>
                {course.duration_label && (
                  <span className="inline-flex h-6 items-center rounded-full bg-[#EEF0F3] px-2.5 text-xs font-medium text-subtle">
                    {course.duration_label}
                  </span>
                )}
                {course.issue_certificate && (
                  <span className="inline-flex h-6 items-center gap-1 rounded-full bg-ok-soft px-2.5 text-xs font-medium text-ok">
                    <Award className="size-3.5" aria-hidden /> Certificate
                  </span>
                )}
                {course.category && (
                  <span className="inline-flex h-6 items-center rounded-full bg-[#EEF0F3] px-2.5 text-xs font-medium text-subtle">
                    {course.category.name}
                  </span>
                )}
              </div>
              <h1 className="text-[26px] leading-tight md:text-[36px]">{course.title}</h1>
              {course.instructors.length > 0 && (
                <p className="text-sm text-subtle">Taught by {course.instructors.map((i) => i.name).join(", ")}</p>
              )}
              {course.summary && <p className="text-[15px] leading-relaxed text-ink md:text-[17px]">{course.summary}</p>}
            </header>

            {course.description_html && (
              <section aria-label="About this course" className="px-4 md:px-0">
                <Html html={course.description_html} />
              </section>
            )}

            {/* Mobile facts card (desktop shows these in the side card) */}
            <section aria-label="Course details" className="mx-4 rounded-[var(--radius-card)] border border-line px-4 md:hidden">
              {facts}
            </section>

            {course.outcomes_html && (
              <section aria-labelledby="outcomes" className="px-4 md:px-0">
                <h2 id="outcomes" className="mb-2 text-xl">
                  What you&apos;ll learn
                </h2>
                <Html html={course.outcomes_html} />
              </section>
            )}

            {course.modules.length > 0 && (
              <section aria-labelledby="curriculum" className="px-4 md:px-0">
                <h2 id="curriculum" className="mb-3 text-xl">
                  Curriculum
                </h2>
                <ol className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line">
                  {course.modules.map((m, i) => {
                    const upcoming = isFuture(m.release_at);
                    const counts = [
                      m.lesson_count && plural(m.lesson_count, "lesson"),
                      m.quiz_count && plural(m.quiz_count, "quiz", "quizzes"),
                      m.assignment_count && plural(m.assignment_count, "assignment"),
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <li key={i} className="border-b border-line-soft last:border-0">
                        <details className="group">
                          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-canvas [&::-webkit-details-marker]:hidden">
                            <span className="min-w-0 flex-1">
                              <span className="block font-heading text-[15px] font-bold">
                                Module {i + 1} · {m.title}
                              </span>
                              <span className="block text-xs text-muted">
                                {upcoming && m.release_at ? (
                                  <>
                                    Opens <LocalDate iso={m.release_at} />
                                    {counts && ` · ${counts}`}
                                  </>
                                ) : (
                                  counts || "Coming soon"
                                )}
                              </span>
                            </span>
                            <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
                          </summary>
                          {m.lessons.length > 0 && (
                            <ul className="flex flex-col gap-2 px-4 pb-4 text-sm text-subtle">
                              {m.lessons.map((l, j) => (
                                <li key={j} className="flex justify-between gap-3">
                                  <span>{l.title}</span>
                                  {l.duration_minutes ? <span className="shrink-0 text-muted">{l.duration_minutes} min</span> : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </details>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}

            {course.upcoming_sessions.length > 0 && (
              <section aria-labelledby="sessions" className="px-4 md:px-0">
                <h2 id="sessions" className="mb-3 text-xl">
                  Upcoming live classes
                </h2>
                <ul className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line">
                  {course.upcoming_sessions.map((s, i) => (
                    <li key={i} className="flex flex-col gap-0.5 border-b border-line-soft px-4 py-3 last:border-0">
                      <span className="text-[15px] font-medium">{s.title}</span>
                      <span className="text-sm text-subtle">
                        <DualTime iso={s.starts_at} instituteTz={tz} /> · {s.duration_minutes} min
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(course.issue_certificate || requirements.length > 0) && (
              <section aria-labelledby="completion" className="px-4 md:px-0">
                <h2 id="completion" className="mb-2 text-xl">
                  {course.issue_certificate ? "Certificate" : "Completion"}
                </h2>
                <p className="text-sm text-subtle">
                  {requirements.length > 0 ? `To complete this course, ${requirements.join(", ")}.` : "Complete the course to finish."}
                  {course.issue_certificate && " You'll receive a verifiable certificate with a QR code."}
                </p>
              </section>
            )}

            <section aria-labelledby="refunds" className="px-4 pb-6 md:px-0">
              <h2 id="refunds" className="mb-2 text-xl">
                Refund policy
              </h2>
              {course.refund_policy && <p className="whitespace-pre-line text-sm text-subtle">{course.refund_policy}</p>}
              <Link href="/refund-policy" className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-primary underline">
                Read the full refund policy
              </Link>
            </section>
          </article>

          {/* Desktop side card */}
          <aside className="hidden md:block" aria-label="Enroll">
            <div className="sticky top-24 flex flex-col gap-4 overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
              {course.intro_video ? (
                <VideoPlayer video={course.intro_video} title={`${course.title} introduction`} />
              ) : (
                <CourseThumb course={course} className="aspect-video h-auto" />
              )}
              <div className="flex flex-col gap-2 px-5 pb-5">
                <EnrollCta slug={course.slug} course={ctaCourse} layout="card" />
                <div className="mt-2">{facts}</div>
                <Link href="/refund-policy" className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
                  Refund policy
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile sticky enroll bar */}
      <div
        className="sticky bottom-0 z-20 border-t border-line bg-white px-4 pt-3 shadow-[0_-4px_16px_rgba(20,24,33,.06)] md:hidden"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <EnrollCta slug={course.slug} course={ctaCourse} layout="bar" />
      </div>
    </>
  );
}
