"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Banner, Button, Field, Input } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { auth } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      await auth.requestPasswordReset(email.trim());
    } catch (err) {
      // Only rate limiting is surfaced; every other outcome shows the same neutral message (no enumeration).
      if (err instanceof ApiError && err.status === 429) {
        setError("Too many requests. Please wait a few minutes and try again.");
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    setSent(true);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">Reset password</h1>
        <p className="text-[15px] text-subtle">Enter your account email and we&apos;ll send a reset link.</p>
      </div>

      {sent ? (
        <div className="flex flex-col gap-4">
          <Banner tone="ok" title="Check your inbox">
            If an account exists for that email, a reset link is on its way.
          </Banner>
          <div className="flex items-center justify-center text-ok" aria-hidden>
            <MailCheck className="size-10" />
          </div>
          <Button variant="outline" block onClick={() => setSent(false)}>
            Try another email
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label="Email" error={error || undefined}>
            {(a) => (
              <Input
                {...a}
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" block loading={busy}>
            Send reset link
          </Button>
        </form>
      )}

      <p className="text-center text-sm text-subtle">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-primary">
          Sign in
        </Link>
      </p>
    </div>
  );
}
