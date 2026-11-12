"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Download, Trash2 } from "lucide-react";
import { useState } from "react";

import { SupportLinks } from "@/components/account/support-links";
import { AppPage } from "@/components/app-shell";
import { useSite } from "@/components/providers";
import { Banner, Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { keys, useMe } from "@/lib/queries";
import type { Me } from "@/lib/types";

function DeleteAccount() {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (confirm.trim() !== "DELETE") {
      setError("Type DELETE to confirm.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/me/deletion-request", { confirm: "DELETE", reason });
      qc.setQueryData<Me>(keys.me, (old) => (old ? { ...old, deletion_pending: true } : old));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <Field label="Why are you leaving? (optional)">
        {(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} className="min-h-20" />}
      </Field>
      <Field label="Type DELETE to confirm" error={error ?? undefined}>
        {(p) => (
          <Input
            {...p}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
        )}
      </Field>
      <Button type="submit" variant="danger" loading={busy} disabled={confirm.trim() !== "DELETE"} className="self-start">
        <Trash2 className="size-4" aria-hidden /> Request deletion
      </Button>
    </form>
  );
}

export default function YourDataPage() {
  const site = useSite();
  const { data: me } = useMe();
  if (!me) return null;

  return (
    <AppPage>
      <PageHeader title="Your data" back={{ href: "/profile", label: "Profile" }} />
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <h2 className="text-base">Download your data</h2>
          <p className="text-sm text-subtle">
            Get a copy of your profile, enrollments, grades and certificates as a JSON file.
          </p>
          <a
            href="/api/v1/me/export"
            download
            className="inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-[10px] border-[1.5px] border-primary bg-white px-4 text-[15px] font-medium text-primary hover:bg-primary-soft"
          >
            <Download className="size-4" aria-hidden /> Download my data
          </a>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-base">Delete account</h2>
          {me.deletion_pending ? (
            <Banner tone="warn" title="Deletion requested">
              Your request is with an administrator. Your account will be removed after the grace period. Contact support if you change your
              mind.
            </Banner>
          ) : site.flags.self_service_deletion ? (
            <>
              <p className="text-sm text-subtle">
                Your profile and submissions are removed. Payment records and issued certificates are kept as required by{" "}
                {site.institute_name}&apos;s retention policy.
              </p>
              <DeleteAccount />
            </>
          ) : (
            <>
              <p className="text-sm text-subtle">To delete your account, please contact support.</p>
              <SupportLinks subject="Account deletion request" />
            </>
          )}
        </Card>
      </div>
    </AppPage>
  );
}
