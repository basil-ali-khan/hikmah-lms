"use client";

import Link from "next/link";

import { useSite } from "./providers";

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-lg bg-primary"
      style={{ width: size, height: size, border: `${Math.max(2, size / 9)}px solid var(--brand-accent)` }}
    />
  );
}

export function Logo({ href = "/", compact = false, light = false }: { href?: string; compact?: boolean; light?: boolean }) {
  const site = useSite();
  return (
    <Link href={href} className="flex min-h-11 items-center gap-2" aria-label={`${site.institute_name} home`}>
      {site.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded, any aspect ratio
        <img src={site.logo_url} alt="" className="h-8 w-auto max-w-[160px] object-contain" />
      ) : (
        <LogoMark />
      )}
      {!compact && !site.logo_url && (
        <span className={`font-heading text-[17px] font-extrabold ${light ? "text-white" : "text-primary"}`}>{site.institute_name}</span>
      )}
    </Link>
  );
}
