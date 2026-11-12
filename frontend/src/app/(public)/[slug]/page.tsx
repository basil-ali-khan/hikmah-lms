import { ChevronDown } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Html } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getSiteConfig, serverGet } from "@/lib/site-config";

type Params = Promise<{ slug: string }>;
type Page = { slug: string; title: string; body_html: string; updated_at: string };

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,80}$/i;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", nbsp: " " };
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, (_, e: string) => ENTITIES[e])
    .trim();

/** Splits sanitized FAQ HTML at top-level <h3> headings into question/answer pairs for an accordion. */
function faqItems(html: string) {
  const parts = html.split(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
  if (parts.length < 3) return null;
  const intro = parts[0].trim();
  const items: { q: string; a: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) items.push({ q: textOf(parts[i]), a: parts[i + 1]?.trim() ?? "" });
  return { intro, items };
}

async function loadPage(slug: string) {
  if (!SLUG_RE.test(slug)) return null;
  const { data } = await serverGet<Page>(`/api/v1/pages/${slug}`, 300);
  return data;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const [page, site] = await Promise.all([loadPage(slug), getSiteConfig()]);
  if (!page) return { title: "Page not found", robots: { index: false } };
  return {
    title: page.title,
    alternates: { canonical: `/${page.slug}` },
    openGraph: { title: page.title, siteName: site.institute_name },
  };
}

export default async function StaticPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [page, site] = await Promise.all([loadPage(slug), getSiteConfig()]);
  if (!page) notFound();
  const faq = page.slug === "faq" ? faqItems(page.body_html) : null;

  return (
    <article className="mx-auto max-w-3xl px-4 py-8 md:px-8 md:py-14">
      <header className="mb-6 flex flex-col gap-1 border-b border-line-soft pb-5">
        <h1 className="text-[26px] leading-tight md:text-[36px]">{page.title}</h1>
        <p className="text-sm text-muted">
          Last updated {formatDate(page.updated_at, {}, site.institute_timezone)}
        </p>
      </header>
      {faq ? (
        <div className="flex flex-col gap-4">
          {faq.intro && <Html html={faq.intro} className="text-[15px] leading-relaxed md:text-base" />}
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-line">
            {faq.items.map((item, i) => (
              <details key={i} className="group border-b border-line-soft last:border-0">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 font-heading text-[15px] font-bold hover:bg-canvas [&::-webkit-details-marker]:hidden">
                  <span className="flex-1">{item.q}</span>
                  <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <Html html={item.a} className="px-4 pb-4 text-[15px] leading-relaxed" />
              </details>
            ))}
          </div>
        </div>
      ) : (
        <Html html={page.body_html} className="text-[15px] leading-relaxed md:text-base" />
      )}
    </article>
  );
}
