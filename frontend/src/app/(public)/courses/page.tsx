import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CourseCard } from "@/components/course/course-card";
import { CatalogFilters } from "@/components/public/catalog-filters";
import { getSiteConfig, serverGet } from "@/lib/site-config";
import type { CourseCard as Course } from "@/lib/types";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteConfig();
  const description = `Live, recorded and hybrid courses from ${site.institute_name}.`;
  return {
    title: "Courses",
    description,
    alternates: { canonical: "/courses" },
    openGraph: { title: `Courses · ${site.institute_name}`, description, siteName: site.institute_name },
  };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function CoursesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const query = new URLSearchParams();
  const q = first(sp.q).trim().slice(0, 100);
  const type = first(sp.type)
    .split(",")
    .filter((t) => ["live", "recorded", "hybrid"].includes(t))
    .join(",");
  const price = ["free", "paid"].includes(first(sp.price)) ? first(sp.price) : "";
  const category = first(sp.category).replace(/[^a-z0-9_,-]/gi, "");
  if (q) query.set("q", q);
  if (type) query.set("type", type);
  if (price) query.set("price", price);
  if (category) query.set("category", category);
  const qs = query.toString();

  const [{ data: courses, status }, { data: categories }] = await Promise.all([
    serverGet<Course[]>(`/api/v1/courses${qs ? `?${qs}` : ""}`),
    serverGet<{ id: number; name: string; slug: string }[]>("/api/v1/categories", 300),
  ]);
  const list = courses ?? [];
  const cats = categories ?? [];
  const filtered = Boolean(qs);
  const categoryName = cats.find((c) => c.slug === category)?.name;

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-10">
      <h1 className="mb-4 text-[22px] md:mb-6 md:text-[30px]">{categoryName ? `${categoryName} courses` : "Courses"}</h1>
      <div className="flex flex-col gap-5 md:grid md:grid-cols-[240px_1fr] md:gap-8">
        <Suspense fallback={<div className="h-28 md:h-80" aria-hidden />}>
          <CatalogFilters categories={cats.map(({ name, slug }) => ({ name, slug }))} />
        </Suspense>

        <section aria-labelledby="results-heading" className="flex min-w-0 flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="results-heading" className="text-sm font-normal text-subtle md:font-heading md:text-lg md:font-bold md:text-ink">
              {filtered ? "Results" : "All courses"}
            </h2>
            <p className="text-sm text-muted" aria-live="polite">
              {list.length} {list.length === 1 ? "course" : "courses"}
            </p>
          </div>

          {status >= 500 ? (
            <div className="rounded-[var(--radius-card)] border border-line p-6 text-center" role="alert">
              <h2 className="text-lg">Courses couldn&apos;t load</h2>
              <p className="mt-1 text-sm text-subtle">Please refresh the page in a moment.</p>
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-line px-4 py-10 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
                <SearchX className="size-6" aria-hidden />
              </div>
              <h2 className="text-lg">{filtered ? "No courses match your filters" : "New courses are coming soon"}</h2>
              <p className="max-w-sm text-sm text-subtle">
                {filtered ? "Try a different search or clear the filters." : "Check back shortly for live and recorded courses."}
              </p>
              {filtered && (
                <Link
                  href="/courses"
                  className="inline-flex min-h-11 items-center rounded-[10px] border-[1.5px] border-primary px-4 text-sm font-medium text-primary"
                >
                  Clear filters
                </Link>
              )}
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((c) => (
                <li key={c.id} className="flex">
                  <div className="flex w-full flex-col [&>a]:flex-1">
                    <CourseCard course={c} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
