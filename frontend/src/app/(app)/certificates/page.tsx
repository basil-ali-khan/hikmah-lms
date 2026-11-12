"use client";

import { Award, Download, Share2 } from "lucide-react";
import { useState } from "react";

import { AppPage } from "@/components/app-shell";
import { useSite } from "@/components/providers";
import { useToast } from "@/components/ui/toast";
import { Button, ButtonLink, Card, Chip, EmptyState, ErrorState, PageHeader, ProgressBar, Skeleton, cn } from "@/components/ui";
import { errorMessage, openSignedFile } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useCertificates, useMyEnrollments } from "@/lib/queries";
import type { Certificate } from "@/lib/types";

function CertificatePreview({ cert, instituteName }: { cert: Certificate; instituteName: string }) {
  return (
    <div
      className={cn(
        "relative flex aspect-[1.414] w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border-4 border-double border-primary bg-white px-4 text-center",
        !cert.valid && "opacity-60 grayscale",
      )}
      aria-hidden
    >
      <span className="text-[9px] font-bold tracking-[0.2em] text-primary uppercase">Certificate of completion</span>
      <span className="font-heading text-base leading-tight font-bold text-ink">{cert.student_name}</span>
      <span className="text-[10px] text-muted">has completed</span>
      <span className="line-clamp-2 font-heading text-sm leading-tight font-bold text-heading">{cert.course.title}</span>
      <span className="mt-1 text-[9px] text-muted">{instituteName}</span>
      <span className="absolute inset-x-0 bottom-0 h-1.5 bg-accent" />
    </div>
  );
}

function CertificateCard({ cert }: { cert: Certificate }) {
  const site = useSite();
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);

  async function share() {
    const url = `${window.location.origin}/verify/${cert.code}`;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: `${cert.course.title} certificate`, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Verification link copied");
    } catch {
      toast(url);
    }
  }

  async function download() {
    setDownloading(true);
    try {
      await openSignedFile(`/api/v1/certificates/${cert.code}/download`);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <CertificatePreview cert={cert} instituteName={site.institute_name} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base leading-snug">{cert.course.title}</h2>
          <p className="text-xs text-muted">
            Issued {formatDate(cert.issued_at)} · ID <span className="font-mono">{cert.code}</span>
          </p>
        </div>
        {!cert.valid && <Chip tone="bad">Revoked</Chip>}
      </div>
      {cert.valid ? (
        <div className="flex gap-2">
          <Button className="flex-1" onClick={download} loading={downloading}>
            <Download className="size-4" aria-hidden /> Download PDF
          </Button>
          <Button variant="outline" className="flex-1" onClick={share}>
            <Share2 className="size-4" aria-hidden /> Share link
          </Button>
        </div>
      ) : (
        <p className="text-sm text-bad">
          This certificate was revoked{cert.revoked_at ? ` on ${formatDate(cert.revoked_at)}` : ""} and can&apos;t be downloaded.
        </p>
      )}
    </Card>
  );
}

function NextCertificateHint({ certs }: { certs: Certificate[] }) {
  const { data } = useMyEnrollments();
  const have = new Set(certs.map((c) => c.course.slug));
  const next = (data ?? [])
    .filter((e) => e.status === "active" && e.progress && e.progress.percent < 100 && !have.has(e.course.slug))
    .sort((a, b) => (b.progress?.percent ?? 0) - (a.progress?.percent ?? 0))[0];
  if (!next || !next.progress) return null;
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="text-base">Earn your next certificate</h2>
      <p className="text-sm text-subtle">
        {next.course.title} is {next.progress.percent}% complete.
      </p>
      <ProgressBar value={next.progress.percent} label={`${next.course.title} progress`} />
      <ButtonLink href={`/learn/${next.course.slug}/grades`} variant="ghost" size="sm" className="self-start">
        See requirements
      </ButtonLink>
    </Card>
  );
}

export default function CertificatesPage() {
  const { data, isLoading, error, refetch } = useCertificates();

  return (
    <AppPage wide>
      <PageHeader title="Certificates" />
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading certificates">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      )}
      {error && <ErrorState error={error} retry={refetch} />}
      {data && (
        <div className="flex flex-col gap-5">
          {data.length === 0 ? (
            <EmptyState icon={<Award className="size-6" aria-hidden />} title="No certificates yet">
              Complete a course to earn your first certificate.
            </EmptyState>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.map((c) => (
                <li key={c.code}>
                  <CertificateCard cert={c} />
                </li>
              ))}
            </ul>
          )}
          <NextCertificateHint certs={data} />
        </div>
      )}
    </AppPage>
  );
}
