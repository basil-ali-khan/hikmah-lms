import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { CSSProperties } from "react";

import { Providers } from "@/components/providers";
import { getSiteConfig } from "@/lib/site-config";

import { fontClassNames, fontStack } from "./fonts";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteConfig();
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    title: { default: site.institute_name, template: `%s · ${site.institute_name}` },
    description: site.description || site.tagline,
    applicationName: site.institute_name,
    appleWebApp: { capable: true, title: site.institute_name, statusBarStyle: "default" },
    openGraph: { siteName: site.institute_name, type: "website" },
    icons: site.favicon_url ? [{ url: site.favicon_url }] : undefined,
  };
}

export async function generateViewport(): Promise<Viewport> {
  const site = await getSiteConfig();
  return { themeColor: site.colors.primary, width: "device-width", initialScale: 1, viewportFit: "cover" };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await getSiteConfig();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const style = {
    "--brand-primary": site.colors.primary,
    "--brand-accent": site.colors.accent,
    "--brand-heading": site.colors.heading,
    "--brand-text": site.colors.text,
    "--brand-surface": site.colors.surface,
    "--brand-font-heading": fontStack(site.fonts.heading, "Raleway"),
    "--brand-font-body": fontStack(site.fonts.body, "Roboto"),
  } as CSSProperties;

  return (
    <html lang="en" className={fontClassNames} style={style}>
      <body className="min-h-dvh">
        <Providers site={site} nonce={nonce}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
