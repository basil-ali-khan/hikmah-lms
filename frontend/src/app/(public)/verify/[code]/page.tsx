import { CheckCircle2, SearchX, XCircle } from "lucide-react";
import type { Metadata } from "next";

import { VerifyForm } from "@/components/public/verify-form";
import { formatDate } from "@/lib/format";
import { getSiteConfig, serverGet } from "@/lib/site-config";
import type { VerifyResult } from "@/lib/types";

type Params = Promise<{ code: string }>;

export const metadata: Metadata = {
  title: "Certificate verification",
  robots: { index: false, follow: false },
};

function clean(code: string) {
  let v = code;
  try {
    v = decodeURIComponent(code);
  } catch {
    /* keep raw */
  }
  return v.trim().toUpperCase().slice(0, 40);
}

export default async function VerifyResultPage({ params }: { params: Params }) {
  const { code: raw } = await params;
  const code = clean(raw);
  const valid = /^[A-Z0-9-]{4,40}$/.test(code);
  const [site, res] = await Promise.all([
    getSiteConfig(),
    valid ? serverGet<VerifyResult>(`/api/v1/verify/${encodeURIComponent(code)}`, 0) : Promise.resolve({ status: 404, data: null }),
  ]);
  const cert = res.data;

  if (cert?.status === "valid") {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-4 py-10 text-center md:py-16">
        <div className="flex size-[72px] items-center justify-center rounded-full bg-ok-soft text-ok">
          <CheckCircle2 className="size-9" aria-hidden />
        </div>
        <span className="inline-flex h-7 items-center rounded-full bg-ok-soft px-3 text-sm font-medium text-ok">Valid certificate</span>
        <h1 className="mt-1 text-[26px] leading-tight md:text-[32px]">{cert.student_name}</h1>
        <p className="text-subtle">completed</p>
        <p className="font-heading text-xl font-bold text-primary">{cert.course_title}</p>
        <dl className="mt-3 w-full rounded-[var(--radius-card)] border border-line bg-white px-4 text-left">
          <div className="flex items-center justify-between gap-3 border-b border-line-soft py-3">
            <dt className="text-sm text-muted">Certificate ID</dt>
            <dd className="font-mono text-sm font-medium">{cert.code}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-line-soft py-3">
            <dt className="text-sm text-muted">Completed</dt>
            <dd className="text-sm">{formatDate(cert.completed_on, {}, "UTC")}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <dt className="text-sm text-muted">Issued by</dt>
            <dd className="text-sm">{cert.issued_by || site.institute_name}</dd>
          </div>
        </dl>
      </div>
    );
  }

  if (cert?.status === "revoked") {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 md:py-16">
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-line bg-white px-4 py-8 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-bad-soft text-bad">
            <XCircle className="size-8" aria-hidden />
          </div>
          <span className="inline-flex h-7 items-center rounded-full bg-bad-soft px-3 text-sm font-medium text-bad">Revoked</span>
          <h1 className="text-xl leading-snug">
            {cert.student_name} · {cert.course_title}
          </h1>
          <p className="text-sm text-subtle">
            {cert.revoked_at
              ? `This certificate was revoked on ${formatDate(cert.revoked_at, {}, site.institute_timezone)} and is no longer valid.`
              : "This certificate was revoked and is no longer valid."}
          </p>
          <p className="font-mono text-xs text-muted">{cert.code}</p>
        </div>
      </div>
    );
  }

  const throttled = res.status === 429;
  const unavailable = res.status >= 500;
  return (
    <div className="mx-auto max-w-lg px-4 py-10 md:py-16">
      <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-line bg-white px-4 py-8 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-[#EEF0F3] text-subtle">
          <SearchX className="size-8" aria-hidden />
        </div>
        <span className="inline-flex h-7 items-center rounded-full bg-[#EEF0F3] px-3 text-sm font-medium text-subtle">
          {throttled ? "Too many lookups" : unavailable ? "Unavailable" : "Not found"}
        </span>
        <h1 className="text-xl leading-snug">
          {throttled
            ? "Please wait a minute and try again"
            : unavailable
              ? "Verification is temporarily unavailable"
              : "We couldn't find that certificate"}
        </h1>
        <p className="text-sm text-subtle">{throttled || unavailable ? "Lookups are limited to keep certificates safe." : "Check the ID and try again."}</p>
        <div className="mt-2 w-full">
          <VerifyForm defaultValue={valid ? code : ""} />
        </div>
      </div>
    </div>
  );
}
