"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { GoogleSignIn } from "@/components/auth/google-button";
import { PasswordStrength } from "@/components/auth/password-strength";
import { safeNext, withNext } from "@/components/auth/safe-next";
import { Turnstile } from "@/components/auth/turnstile";
import { useSite } from "@/components/providers";
import { Banner, Button, Checkbox, Field, Input, Spinner } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { auth } from "@/lib/auth";
import { keys, useMe } from "@/lib/queries";

function SignupForm() {
  const site = useSite();
  const minLen = site.password_min_length;
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const next = safeNext(params.get("next"));
  const { data: me, isLoading } = useMe();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");

  useEffect(() => {
    if (me && !done) router.replace("/dashboard");
  }, [me, done, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const local: Record<string, string[]> = {};
    if (fullName.trim().length < 2) local.full_name = ["Please enter your full name."];
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) local.email = ["Enter a valid email address."];
    if (password.length < minLen) local.password = [`Use at least ${minLen} characters.`];
    if (!accept) local.accept_terms = ["Please accept the Terms and Privacy policy."];
    setErrors(local);
    if (Object.keys(local).length) return;

    setBusy(true);
    try {
      // Success: 200 (signed in) or 401 with a pending verify_email flow — both mean the account exists now.
      await auth.signup({ full_name: fullName.trim(), email: email.trim(), password, accept_terms: true, turnstile_token: turnstileToken || undefined });
      setDone(true);
      await qc.invalidateQueries({ queryKey: keys.me });
      const target = `/verify-email?email=${encodeURIComponent(email.trim())}`;
      router.replace(next !== "/dashboard" ? `${target}&next=${encodeURIComponent(next)}` : target);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
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

  if (isLoading || (me && !done)) return <Spinner label="Checking your session" />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">Create your account</h1>
        <p className="text-sm text-subtle">One account for every {site.institute_name} course.</p>
      </div>

      <GoogleSignIn next={next} dividerLabel="or with email" />

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError && (
          <div role="alert">
            <Banner tone="bad">{formError}</Banner>
          </div>
        )}
        <Field label="Full name" required error={errors.full_name}>
          {(a) => (
            <Input {...a} name="full_name" autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          )}
        </Field>
        <Field label="Email" required error={errors.email}>
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
        <Field label="Password" required error={errors.password ?? errors.password1}>
          {(a) => (
            <>
              <Input
                {...a}
                type="password"
                name="password"
                autoComplete="new-password"
                required
                minLength={minLen}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={[a["aria-describedby"], "pw-strength"].filter(Boolean).join(" ")}
              />
              <PasswordStrength password={password} id="pw-strength" />
            </>
          )}
        </Field>
        <div className="flex flex-col gap-1">
          <Checkbox
            name="accept_terms"
            checked={accept}
            onChange={(e) => setAccept(e.target.checked)}
            aria-invalid={errors.accept_terms ? true : undefined}
            label={
              <>
                I agree to the{" "}
                <Link href="/terms" target="_blank" className="font-medium text-primary underline">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank" className="font-medium text-primary underline">
                  Privacy policy
                </Link>
              </>
            }
          />
          {errors.accept_terms && (
            <p className="text-xs text-bad" role="alert">
              {errors.accept_terms.join(" ")}
            </p>
          )}
        </div>
        <Turnstile onToken={setTurnstileToken} />
        <Button type="submit" block loading={busy}>
          Create account
        </Button>
      </form>

      <p className="text-center text-sm text-subtle">
        Already have an account?{" "}
        <Link href={withNext("/login", params.get("next"))} className="font-medium text-primary">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SignupForm />
    </Suspense>
  );
}
