import { Award, BookOpen, Video } from "lucide-react";
import Link from "next/link";

import { CourseCard } from "@/components/course/course-card";
import { getSiteConfig, serverGet } from "@/lib/site-config";
import type { CourseCard as Course } from "@/lib/types";

export default async function Home() {
  const [site, { data: featured }] = await Promise.all([
    getSiteConfig(),
    serverGet<Course[]>("/api/v1/courses?featured=1"),
  ]);
  const courses = (featured ?? []).slice(0, 4);

  return (
    <>
      <section className="bg-primary text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 md:flex-row md:items-center md:px-8 md:py-16">
          <div className="flex flex-1 flex-col gap-4">
            <span className="inline-flex h-6 w-fit items-center rounded-full bg-accent px-2.5 text-xs font-medium text-ink">
              Live · Recorded · Hybrid
            </span>
            <h1 className="text-[28px] leading-tight text-white md:text-[44px]">{site.tagline || site.institute_name}</h1>
            {site.description && <p className="max-w-xl text-[15px] leading-relaxed text-[#DCE3F5] md:text-[17px]">{site.description}</p>}
            <div className="mt-2 flex flex-col gap-2.5 sm:flex-row">
              <Link href="/courses" className="inline-flex min-h-12 items-center justify-center rounded-[10px] bg-accent px-6 font-medium text-ink">
                Browse courses
              </Link>
              <Link
                href="/signup"
                className="inline-flex min-h-12 items-center justify-center rounded-[10px] border-[1.5px] border-white px-6 font-medium text-white hover:bg-white/10"
              >
                Create account
              </Link>
            </div>
          </div>
          <div className="hidden flex-1 grid-cols-3 gap-3 md:grid" aria-hidden>
            {[Video, BookOpen, Award].map((Icon, i) => (
              <div key={i} className="flex aspect-square items-center justify-center rounded-2xl bg-white/10">
                <Icon className="size-10 text-accent" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl md:text-2xl">Featured courses</h2>
          <Link href="/courses" className="text-sm font-medium text-primary">
            See all courses
          </Link>
        </div>
        {courses.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {courses.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        ) : (
          <p className="text-subtle">New courses are coming soon.</p>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-12 md:px-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { Icon: Video, title: "Live classes", text: "Join scheduled classes with your teachers, then rewatch the recording." },
            { Icon: BookOpen, title: "Learn at your pace", text: "Recorded lessons, readings and quizzes that work well on your phone." },
            { Icon: Award, title: "Certificates", text: "Earn a verifiable certificate with a QR code when you complete a course." },
          ].map(({ Icon, title, text }) => (
            <div key={title} className="flex gap-3 rounded-[var(--radius-card)] border border-line p-4">
              <Icon className="size-6 shrink-0 text-primary" aria-hidden />
              <div>
                <h3 className="text-base">{title}</h3>
                <p className="text-sm text-subtle">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
