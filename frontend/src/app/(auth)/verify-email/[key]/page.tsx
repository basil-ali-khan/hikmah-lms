"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ButtonLink, Spinner } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { auth } from "@/lib/auth";
import { keys, useMe } from "@/lib/queries";

function decode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export default function VerifyEmailKeyPage() {
  const { key } = useParams<{ key: string }>();
  const qc = useQueryClient();
  const started = useRef(false);
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [error, setError] = useState("");
  const { data: me } = useMe();

  useEffect(() => {
    if (started.current) return; // verify keys are single-use; guard against double effects
    started.current = true;
    auth
      .verifyEmail(decode(key))
      .then(async () => {
        await qc.invalidateQueries({ queryKey: keys.me });
        setState("ok");
      })
      .catch((err) => {
        setError(errorMessage(err));
        setState("error");
      });
  }, [key, qc]);

  if (state === "working") return <Spinner label="Verifying your email" />;

  if (state === "error") {
    return (
      <div className="flex flex-col items-center gap-4 text-center" role="alert">
        <div className="flex size-16 items-center justify-center rounded-full bg-bad-soft text-bad">
          <XCircle className="size-8" aria-hidden />
        </div>
        <h1 className="text-2xl">This link has expired</h1>
        <p className="text-[15px] text-subtle">
          The verification link is invalid or has already been used.
          {error && error !== "Something went wrong." ? ` (${error})` : ""}
        </p>
        <ButtonLink href={me ? "/verify-email" : "/login?next=/verify-email"} block>
          Send a new link
        </ButtonLink>
      </div>
    );
  }

  const href = me?.profile_complete ? "/dashboard" : me ? "/complete-profile" : "/login?next=/complete-profile";
  return (
    <div className="flex flex-col items-center gap-4 text-center" role="status">
      <div className="flex size-16 items-center justify-center rounded-full bg-ok-soft text-ok">
        <CheckCircle2 className="size-8" aria-hidden />
      </div>
      <h1 className="text-2xl">Email verified</h1>
      <p className="text-[15px] text-subtle">
        {me?.profile_complete ? "You're all set." : "Next, tell us a little about yourself. You only do this once."}
      </p>
      <ButtonLink href={href} block>
        {me?.profile_complete ? "Go to dashboard" : me ? "Complete profile" : "Sign in to continue"}
      </ButtonLink>
    </div>
  );
}
