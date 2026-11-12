import Link from "next/link";

import { courseTypeLabel, money } from "@/lib/format";
import type { CourseCard as Course } from "@/lib/types";

import { LocalDate } from "../local-time";

export function CoursePrice({ course }: { course: Pick<Course, "is_free" | "price" | "currency"> }) {
  return course.is_free ? (
    <span className="inline-flex h-6 items-center rounded-full bg-ok-soft px-2.5 text-xs font-medium text-ok">Free</span>
  ) : (
    <span className="font-bold text-ink">{money(course.price, course.currency)}</span>
  );
}

export function CourseThumb({ course, className = "h-32" }: { course: Pick<Course, "thumbnail_url" | "title">; className?: string }) {
  return course.thumbnail_url ? (
    // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded thumbnails served by the API
    <img src={course.thumbnail_url} alt="" className={`w-full object-cover ${className}`} loading="lazy" />
  ) : (
    <div
      className={`flex w-full items-end bg-gradient-to-br from-primary to-primary-strong p-3 ${className}`}
      aria-hidden
    >
      <span className="line-clamp-2 font-heading text-sm font-bold text-white/90">{course.title}</span>
    </div>
  );
}

/** Catalog card. Server-renderable (no client hooks). */
export function CourseCard({ course }: { course: Course }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-white transition-shadow hover:shadow-md"
    >
      <CourseThumb course={course} />
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex h-6 items-center rounded-full bg-primary-soft px-2.5 text-xs font-medium text-primary">
            {courseTypeLabel[course.course_type]}
          </span>
          {course.category && (
            <span className="inline-flex h-6 items-center rounded-full bg-[#EEF0F3] px-2.5 text-xs font-medium text-subtle">
              {course.category.name}
            </span>
          )}
        </div>
        <h3 className="text-[15px] leading-snug group-hover:text-primary">{course.title}</h3>
        <p className="text-xs text-muted">
          {[course.instructors.map((i) => i.name).join(", "), course.duration_label].filter(Boolean).join(" · ")}
          {course.starts_at && (
            <>
              {" · Starts "}
              <LocalDate iso={course.starts_at} />
            </>
          )}
        </p>
        <div className="mt-auto flex items-center justify-between pt-1">
          <CoursePrice course={course} />
          {course.seats_left !== null && course.seats_left <= 15 && (
            <span className="text-xs text-muted">{course.seats_left === 0 ? "Full" : `${course.seats_left} seats left`}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
