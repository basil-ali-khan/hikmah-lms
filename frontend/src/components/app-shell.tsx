"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Award, Bell, BookOpen, CalendarDays, CreditCard, Home, LogOut, Shield, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { auth } from "@/lib/auth";
import { useMe, useNotifications } from "@/lib/queries";

import { Logo } from "./brand";
import { Spinner, cn } from "./ui";

const TABS = [
  { href: "/dashboard", label: "Home", Icon: Home },
  { href: "/my-courses", label: "My courses", Icon: BookOpen },
  { href: "/schedule", label: "Schedule", Icon: CalendarDays },
  { href: "/certificates", label: "Certificates", Icon: Award },
  { href: "/profile", label: "Profile", Icon: User },
];

const SIDEBAR_EXTRA = [{ href: "/payments", label: "Payments", Icon: CreditCard }];

// Pages a signed-in user may use before their profile is complete.
const PROFILE_EXEMPT = ["/complete-profile", "/profile", "/notifications"];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`) || (href === "/my-courses" && pathname.startsWith("/learn"));
}

/** Requires a session; sends incomplete profiles to /complete-profile. Renders sidebar (desktop) + bottom tabs (mobile). */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me, isLoading } = useMe();
  const { data: notes } = useNotifications(!!me);

  useEffect(() => {
    if (isLoading) return;
    if (me === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (me && !me.profile_complete && !PROFILE_EXEMPT.some((p) => pathname.startsWith(p))) {
      router.replace(`/complete-profile?next=${encodeURIComponent(pathname)}`);
    }
  }, [me, isLoading, pathname, router]);

  if (isLoading || !me) return <Spinner label="Loading your account" />;

  async function signOut() {
    await auth.logout();
    qc.clear();
    router.replace("/login");
  }

  const unread = notes?.unread_count ?? 0;
  const focusMode = pathname.includes("/attempt/"); // quiz taking: no navigation chrome

  return (
    <div className="flex min-h-dvh flex-col">
      {!focusMode && (
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line-soft bg-white px-4 md:h-16 md:px-6">
          <Logo href="/dashboard" />
          <div className="ml-auto flex items-center gap-2">
            {me.is_staff && me.staff_panel_url && (
              <a
                href={me.staff_panel_url}
                className="hidden min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary-soft md:inline-flex"
              >
                <Shield className="size-4" aria-hidden /> Staff panel
              </a>
            )}
            <Link
              href="/notifications"
              className="relative flex size-11 items-center justify-center rounded-[10px] bg-[#F2F4F7]"
              aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
            >
              <Bell className="size-5 text-heading" aria-hidden />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          </div>
        </header>
      )}
      <div className="flex flex-1">
        {!focusMode && (
          <nav className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 flex-col gap-0.5 border-r border-line-soft bg-[#FBFCFD] p-3 md:flex" aria-label="Account">
            {[...TABS, ...SIDEBAR_EXTRA].map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-2.5 rounded-lg px-3 text-sm text-heading hover:bg-primary-soft",
                  isActive(pathname, href) && "bg-primary-soft font-bold text-primary",
                )}
              >
                <Icon className="size-[18px]" aria-hidden />
                {label}
              </Link>
            ))}
            <button onClick={signOut} className="mt-auto flex h-11 items-center gap-2.5 rounded-lg px-3 text-sm text-heading hover:bg-primary-soft">
              <LogOut className="size-[18px]" aria-hidden /> Sign out
            </button>
          </nav>
        )}
        <main id="main" className={cn("min-w-0 flex-1", !focusMode && "pb-24 md:pb-10")}>
          {children}
        </main>
      </div>
      {!focusMode && (
        <nav
          className="pb-safe fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-white md:hidden"
          aria-label="Primary"
        >
          {TABS.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] text-muted", active && "font-bold text-primary")}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

/** Standard padded content column for app pages. */
export function AppPage({ children, wide = false, className }: { children: React.ReactNode; wide?: boolean; className?: string }) {
  return <div className={cn("mx-auto w-full px-4 py-5 md:px-8 md:py-7", wide ? "max-w-6xl" : "max-w-3xl", className)}>{children}</div>;
}
