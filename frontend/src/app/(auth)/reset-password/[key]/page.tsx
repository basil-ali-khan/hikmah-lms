"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { PasswordStrength, usePasswordMin } from "@/components/auth/password-strength";
import { Banner, Button, ButtonLink, Field, Input } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { auth } from "@/lib/auth";
import { keys } from "@/lib/queries";

function decode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export default function ResetPasswordPage() {
  const { key } = useParams<{ key: string }>();
  const qc = useQueryClient();
  const minLen = usePasswordMin();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState("");
  const [badKey, setBadKey] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const local: Record<string, string[]> = {};
    if (password.length < minLen) local.password = [`Use at least ${minLen} characters.`];
    if (confirm !== password) local.confirm = ["Passwords don't match."];
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await auth.resetPassword(decode(key), password);
      await qc.invalidateQueries({ queryKey: keys.me });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.key) {
        setBadKey(true);
      } else if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        const { __all__, ...rest } = err.fieldErrors;
        setErrors(rest);
        if (__all__) setFormError(__all__.join(" "));
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 text-center" role="status">
        <div className="flex size-16 items-center justify-center rounded-full bg-ok-soft text-ok">
          <CheckCircle2 className="size-8" aria-hidden />
        </div>
        <h1 className="text-2xl">Password updated</h1>
        <p className="text-[15px] text-subtle">You&apos;ve been signed out on other devices. Sign in with your new password.</p>
        <ButtonLink href="/login" block>
          Sign in
        </ButtonLink>
      </div>
    );
  }

  if (badKey) {
    return (
      <div className="flex flex-col gap-4" role="alert">
        <h1 className="text-2xl">This link has expired</h1>
        <p className="text-[15px] text-subtle">Password reset links can only be used once and expire after a while.</p>
        <ButtonLink href="/forgot-password" block>
          Send a new link
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl">Choose a new password</h1>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError && (
          <div role="alert">
            <Banner tone="bad">{formError}</Banner>
          </div>
        )}
        <Field label="New password" required error={errors.password}>
          {(a) => (
            <>
              <Input
                {...a}
                type="password"
                name="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={[a["aria-describedby"], "pw-strength"].filter(Boolean).join(" ")}
              />
              <PasswordStrength password={password} id="pw-strength" />
            </>
          )}
        </Field>
        <Field label="Confirm password" required error={errors.confirm}>
          {(a) => (
            <Input
              {...a}
              type="password"
              name="confirm"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" block loading={busy}>
          Update password
        </Button>
      </form>
      <p className="text-center text-sm text-subtle">
        <Link href="/login" className="font-medium text-primary">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
