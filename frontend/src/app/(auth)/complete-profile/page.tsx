"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { ProfileForm, type ProfilePayload } from "@/components/auth/profile-form";
import { safeNext } from "@/components/auth/safe-next";
import { ErrorState, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { keys, useMe, useProfileFields } from "@/lib/queries";
import type { Me } from "@/lib/types";

function CompleteProfile() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const next = safeNext(params.get("next"));
  const { data: me, isLoading: meLoading } = useMe();
  const { data: fields, isLoading, error, refetch } = useProfileFields();

  useEffect(() => {
    if (!meLoading && me === null) {
      router.replace(`/login?next=${encodeURIComponent(`/complete-profile${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`)}`);
    }
  }, [me, meLoading, next, router]);

  async function save(payload: ProfilePayload) {
    const updated = await api.patch<Me>("/api/v1/me", payload);
    qc.setQueryData(keys.me, updated);
    await qc.invalidateQueries({ queryKey: keys.me });
    router.replace(next);
  }

  if (meLoading || !me || isLoading) return <Spinner label="Loading your profile" />;
  if (error || !fields) return <ErrorState error={error} retry={refetch} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl">Your profile</h1>
          <span className="text-xs text-muted">Step 1 of 1</span>
        </div>
        <p className="text-sm text-subtle">Required once. Fields marked * are needed to enroll.</p>
        <p className="text-xs text-muted">Signed in as {me.email}</p>
      </div>
      <ProfileForm
        fields={fields}
        initial={{ full_name: me.full_name, data: me.profile.data }}
        requireConsent={!me.profile.privacy_consent_at}
        onSubmit={save}
      />
    </div>
  );
}

export default function CompleteProfilePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <CompleteProfile />
    </Suspense>
  );
}
