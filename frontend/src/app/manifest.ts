import type { MetadataRoute } from "next";

import { getSiteConfig } from "@/lib/site-config";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const site = await getSiteConfig();
  return {
    name: site.institute_name,
    short_name: site.institute_name.split(" ")[0],
    description: site.tagline,
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: site.colors.primary,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
