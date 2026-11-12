"use client";

import { useState } from "react";

import { errorMessage } from "@/lib/api";
import { auth } from "@/lib/auth";
import { useMe } from "@/lib/queries";

import { Banner, Button } from "./ui";
import { useToast } from "./ui/toast";

export function EmailVerifyBanner() {
  const { data: me } = useMe();
  const toast = useToast();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!me || me.email_verified) return null;
  return (
    <Banner
      tone="warn"
      title="Please verify your email"
      action={
        <Button
          size="sm"
          variant="outline"
          loading={busy}
          disabled={sent}
          onClick={async () => {
            setBusy(true);
            try {
              await auth.resendVerification(me.email);
              setSent(true);
              toast("Verification email sent.");
            } catch (e) {
              toast(errorMessage(e), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          {sent ? "Sent" : "Resend"}
        </Button>
      }
    >
      We sent a link to <b>{me.email}</b>. You need to verify it before enrolling in a course.
    </Banner>
  );
}
