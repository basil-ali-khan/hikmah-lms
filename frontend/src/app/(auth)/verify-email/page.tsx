"use client";

import { useQueryClient } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { safeNext } from "@/components/auth/safe-next";
import { Banner, Button, ButtonLink, Spinner } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { auth } from "@/lib/auth";
import { useMe } from "@/lib/queries";

const COOLDOWN = 45;

function VerifyEmailSent() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const { data: me, isLoading } = useMe();
  const email = me?.email ?? params.get("email") ?? "";
  const next = safeNext(params.get("next"));

  const [left, setLeft] = useState(COOLDOWN);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  async function resend() {
    setBusy(true);
    setMessage(null);
    try {
      if (me) {
        await auth.resendVerification(me.email);
      } else {
        // A verification flow is pending in this browser session (signed up but not signed in).
        await api.post("/_allauth/browser/v1/auth/email/verify/resend");
      }
      setMessage({ tone: "ok", text: "We sent a new verification link." });
      setLeft(COOLDOWN);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setMessage({ tone: "bad", text: "Please sign in to request a new verification link." });
      } else if (err instanceof ApiError && err.status === 429) {
        setMessage({ tone: "bad", text: "Please wait a few minutes before requesting another email." });
        setLeft(COOLDOWN);
      } else {
        setMessage({ tone: "bad", text: errorMessage(err) });
      }
    } finally {
      setBusy(false);
    }
  }

  async function differentEmail() {
    if (me) {
      await auth.logout().catch(() => undefined);
      qc.clear();
    }
    router.push("/signup");
  }

  if (isLoading) return <Spinner />;

  if (me?.email_verified) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-ok-soft text-ok">
          <MailCheck className="size-8" aria-hidden />
        </div>
        <h1 className="text-2xl">Your email is verified</h1>
        <ButtonLink href={me.profile_complete ? next : `/complete-profile?next=${encodeURIComponent(next)}`} block>
          Continue
        </ButtonLink>
      </div>
    );
  }

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary">
        <MailCheck className="size-8" aria-hidden />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl">Check your inbox</h1>
        <p className="text-[15px] text-subtle">
          We sent a verification link to {email ? <b className="text-ink">{email}</b> : "your email address"}. Open it on this device
          to continue.
        </p>
        <p className="text-sm text-muted">You must verify your email before you can enroll in a course.</p>
      </div>

      {message && (
        <div role={message.tone === "bad" ? "alert" : "status"}>
          <Banner tone={message.tone}>{message.text}</Banner>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button variant="outline" block onClick={resend} loading={busy} disabled={left > 0}>
          Resend email
        </Button>
        <p className="text-center text-xs text-muted" aria-live="polite">
          {left > 0 ? `You can resend in ${mm}:${ss}` : "Didn't get it? Check your spam folder, then resend."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {me && (
          <ButtonLink href={me.profile_complete ? next : `/complete-profile?next=${encodeURIComponent(next)}`} variant="ghost" block>
            Continue for now
          </ButtonLink>
        )}
        <Button variant="ghost" block onClick={differentEmail}>
          Use a different email
        </Button>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <VerifyEmailSent />
    </Suspense>
  );
}
