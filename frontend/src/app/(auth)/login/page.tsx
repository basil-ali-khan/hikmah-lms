"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { GoogleSignIn } from "@/components/auth/google-button";
import { safeNext, withNext } from "@/components/auth/safe-next";
import { Banner, Button, Field, Input, Spinner } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { auth } from "@/lib/auth";
import { keys, useMe } from "@/lib/queries";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const next = safeNext(params.get("next"));
  const socialError = params.get("error");
  const { data: me, isLoading } = useMe();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState("");
  const [locked, setLocked] = useState("");

  useEffect(() => {
    if (me) router.replace(next);
  }, [me, next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setFormError("");
    setLocked("");
    setBusy(true);
    try {
      const res = await auth.login(email.trim(), password);
      if (res.status === 401 && !res.meta?.is_authenticated) {
        // Credentials accepted but another step is pending (e.g. staff 2FA handled by the server-rendered flow).
        setFormError("We couldn't finish signing you in. Please try again.");
        return;
      }
      await qc.invalidateQueries({ queryKey: keys.me });
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiError && (err.code === "locked_out" || err.status === 429)) {
        setLocked(err.message);
      } else if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        const { __all__, ...rest } = err.fieldErrors;
        setFieldErrors(rest);
        if (__all__) setFormError(__all__.join(" "));
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || me) return <Spinner label="Checking your session" />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl">Welcome back</h1>

      {socialError && (
        <Banner tone="bad" title="Google sign-in didn't work">
          Please try again, or sign in with your email and password.
        </Banner>
      )}

      <GoogleSignIn next={next} />

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label="Email" error={fieldErrors.email}>
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
        <div className="flex flex-col gap-1.5">
          <Field label="Password" error={fieldErrors.password ?? (formError ? formError : undefined)}>
            {(a) => (
              <Input
                {...a}
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          <Link href="/forgot-password" className="inline-flex min-h-11 items-center self-end text-sm font-medium text-primary">
            Forgot password?
          </Link>
        </div>

        {locked && (
          <div role="alert">
            <Banner tone="warn">
              {locked}{" "}
              <Link href="/forgot-password" className="font-semibold underline">
                Reset password
              </Link>
            </Banner>
          </div>
        )}

        <Button type="submit" block loading={busy} disabled={!email || !password}>
          Sign in
        </Button>
      </form>

      <p className="text-center text-sm text-subtle">
        New here?{" "}
        <Link href={withNext("/signup", params.get("next"))} className="font-medium text-primary">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <LoginForm />
    </Suspense>
  );
}
