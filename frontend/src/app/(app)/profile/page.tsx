"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Database, Shield } from "lucide-react";
import Link from "next/link";

import { AppPage } from "@/components/app-shell";
import { ProfileForm, type ProfilePayload } from "@/components/auth/profile-form";
import { EmailVerifyBanner } from "@/components/email-verify-banner";
import { useToast } from "@/components/ui/toast";
import { Card, Chip, ErrorState, Field, Input, PageHeader, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { keys, useMe, useProfileFields } from "@/lib/queries";
import type { Me } from "@/lib/types";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

export default function ProfilePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const fields = useProfileFields();

  async function save(payload: ProfilePayload) {
    const updated = await api.patch<Me>("/api/v1/me", payload);
    qc.setQueryData(keys.me, updated);
    toast("Profile saved");
  }

  if (!me) return null; // AppShell handles loading / signed-out

  return (
    <AppPage>
      <PageHeader title="Profile" />
      <div className="flex flex-col gap-4">
        <EmailVerifyBanner />
        <Card className="flex items-center gap-3">
          <div
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-lg font-bold text-white"
            aria-hidden
          >
            {initials(me.full_name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-lg font-bold">{me.full_name}</p>
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
              <span className="truncate">{me.email}</span>
              {me.email_verified ? <Chip tone="ok">Verified</Chip> : <Chip tone="warn">Not verified</Chip>}
            </p>
          </div>
        </Card>

        {me.deletion_pending && (
          <Link href="/profile/data" className="rounded-xl bg-bad-soft px-3.5 py-3 text-sm font-medium text-[#7F1D1D] underline">
            Your account deletion request is pending.
          </Link>
        )}

        <Card>
          <h2 className="mb-3 text-base">Your details</h2>
          <div className="mb-4">
            <Field label="Email" help="Contact support to change the email you sign in with.">
              {(p) => <Input {...p} type="email" value={me.email} readOnly />}
            </Field>
          </div>
          {fields.isLoading && (
            <div className="flex flex-col gap-3" aria-label="Loading profile fields">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          )}
          {fields.error && <ErrorState error={fields.error} retry={fields.refetch} />}
          {fields.data && (
            <ProfileForm
              fields={fields.data}
              initial={{ full_name: me.full_name, data: me.profile.data }}
              requireConsent={!me.profile.privacy_consent_at}
              onSubmit={save}
              submitLabel="Save changes"
            />
          )}
        </Card>

        <Card className="p-0">
          <nav aria-label="Account settings">
            <ul>
              {[
                { href: "/profile/security", label: "Account & security", sub: "Password, sessions, notifications", Icon: Shield },
                { href: "/profile/data", label: "Your data", sub: "Download your data or delete your account", Icon: Database },
              ].map(({ href, label, sub, Icon }) => (
                <li key={href} className="border-b border-line-soft last:border-0">
                  <Link href={href} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-primary-soft">
                    <Icon className="size-5 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{label}</p>
                      <p className="truncate text-xs text-muted">{sub}</p>
                    </div>
                    <ChevronRight className="size-4 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </Card>
      </div>
    </AppPage>
  );
}
