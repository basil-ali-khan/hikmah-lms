"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { safeNext } from "@/components/auth/safe-next";
import { Banner, ButtonLink, Spinner } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { keys } from "@/lib/queries";
import type { Me } from "@/lib/types";

function Callback() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const next = safeNext(params.get("next"));
  const error = params.get("error");
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (error || started.current) return;
    started.current = true;
    (async () => {
      try {
        const me = await qc.fetchQuery({ queryKey: keys.me, queryFn: () => api.get<Me>("/api/v1/me"), staleTime: 0 });
        if (!me.profile_complete) router.replace(`/complete-profile?next=${encodeURIComponent(next)}`);
        else router.replace(next);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) qc.setQueryData(keys.me, null);
        setFailed(true);
      }
    })();
  }, [error, next, qc, router]);

  if (error || failed) {
    return (
      <div className="flex flex-col gap-4" role="alert">
        <h1 className="text-2xl">Sign-in didn&apos;t complete</h1>
        <Banner tone="bad">
          {error === "cancelled" || error === "access_denied"
            ? "Google sign-in was cancelled."
            : "We couldn't sign you in with Google. Please try again, or use your email and password."}
        </Banner>
        <ButtonLink href={`/login?next=${encodeURIComponent(next)}`} block>
          Back to sign in
        </ButtonLink>
      </div>
    );
  }

  return <Spinner label="Signing you in" />;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Callback />
    </Suspense>
  );
}
