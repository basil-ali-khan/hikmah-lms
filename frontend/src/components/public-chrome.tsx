"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useMe } from "@/lib/queries";

import { Logo } from "./brand";
import { useSite } from "./providers";
import { ButtonLink, cn } from "./ui";
import { Sheet } from "./ui/sheet";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/courses", label: "Courses" },
  { href: "/verify", label: "Verify certificate" },
  { href: "/faq", label: "FAQ" },
];

export function PublicHeader() {
  const pathname = usePathname();
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-line-soft bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 md:px-8">
        <Logo />
        <nav className="hidden flex-1 gap-6 text-[15px] md:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn("text-heading hover:text-primary", pathname === n.href && "font-bold text-primary")}
              aria-current={pathname === n.href ? "page" : undefined}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          {me ? (
            <ButtonLink href="/dashboard">My dashboard</ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="subtle">
                Sign in
              </ButtonLink>
              <ButtonLink href="/signup">Create account</ButtonLink>
            </>
          )}
        </div>
        <button
          className="ml-auto flex size-11 items-center justify-center rounded-[10px] bg-[#F2F4F7] md:hidden"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </div>
      <Sheet open={open} onOpenChange={setOpen} title="Menu">
        <nav className="flex flex-col" aria-label="Mobile">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="border-b border-line-soft py-3.5 text-base">
              {n.label}
            </Link>
          ))}
          <div className="mt-4 flex flex-col gap-2">
            {me ? (
              <ButtonLink href="/dashboard" block onClick={() => setOpen(false)}>
                My dashboard
              </ButtonLink>
            ) : (
              <>
                <ButtonLink href="/signup" block onClick={() => setOpen(false)}>
                  Create account
                </ButtonLink>
                <ButtonLink href="/login" variant="outline" block onClick={() => setOpen(false)}>
                  Sign in
                </ButtonLink>
              </>
            )}
          </div>
        </nav>
      </Sheet>
    </header>
  );
}

export function Footer() {
  const site = useSite();
  return (
    <footer className="mt-auto bg-ink text-[13px] text-[#D7DCE3]">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 md:flex-row md:items-center md:justify-between md:px-8">
        <p>
          © {new Date().getFullYear()} {site.institute_name}
          {site.support.email && (
            <>
              {" · Support: "}
              <a className="text-white underline" href={`mailto:${site.support.email}`}>
                {site.support.email}
              </a>
            </>
          )}
          {site.support.whatsapp && (
            <>
              {" · WhatsApp: "}
              <a className="text-white underline" href={`https://wa.me/${site.support.whatsapp.replace(/\D/g, "")}`}>
                {site.support.whatsapp}
              </a>
            </>
          )}
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Footer">
          {site.footer_pages.map((p) => (
            <Link key={p.slug} href={`/${p.slug}`} className="text-white hover:underline">
              {p.title}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
