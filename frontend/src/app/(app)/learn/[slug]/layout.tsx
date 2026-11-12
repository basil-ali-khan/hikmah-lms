"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

import { AppPage } from "@/components/app-shell";
import { CourseAccessError } from "@/components/learn/access-error";
import { PageHeader, Skeleton, cn } from "@/components/ui";
import { useLearn } from "@/lib/queries";

/** Course home chrome (back link, title, Content / Live / Grades tabs). Child pages such as lessons, quizzes,
 * assignments and session details render their own headers, so the chrome is only shown on the tab pages. */
export default function LearnCourseLayout({ children }: { children: React.ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const pathname = usePathname();
  const base = `/learn/${slug}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/\/$/, "") : pathname;
  const tabPage = rest === "" || rest === "/live" || rest === "/grades";

  const { data, error, refetch } = useLearn(slug);

  if (!tabPage) return <>{children}</>;

  const tabs = [
    { href: base, label: "Content", active: rest === "" },
    { href: `${base}/live`, label: "Live", active: rest === "/live" },
    { href: `${base}/grades`, label: "Grades", active: rest === "/grades" },
    { href: `/courses/${slug}`, label: "Info", active: false },
  ];

  if (error) {
    return (
      <AppPage>
        <PageHeader title="Course" back={{ href: "/my-courses", label: "My courses" }} />
        <CourseAccessError
          error={error}
          slug={slug}
          retry={refetch}
          notFoundTitle="Course not found"
          backHref={{ href: "/my-courses", label: "My courses" }}
        />
      </AppPage>
    );
  }

  return (
    <AppPage wide>
      <PageHeader
        title={data ? data.course.title : <Skeleton className="h-7 w-56" />}
        back={{ href: "/my-courses", label: "My courses" }}
      />
      <nav aria-label="Course sections" className="-mx-4 mb-4 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
        <ul className="flex gap-1">
          {tabs.map((t) => (
            <li key={t.label}>
              <Link
                href={t.href}
                aria-current={t.active ? "page" : undefined}
                className={cn(
                  "-mb-px flex min-h-11 items-center border-b-[3px] border-transparent px-3 text-sm font-medium whitespace-nowrap text-subtle hover:text-primary",
                  t.active && "border-primary font-bold text-primary",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </AppPage>
  );
}
