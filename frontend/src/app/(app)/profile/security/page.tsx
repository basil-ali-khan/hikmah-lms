"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Monitor, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppPage } from "@/components/app-shell";
import { useSite } from "@/components/providers";
import { useToast } from "@/components/ui/toast";
import { Banner, Button, Card, Chip, ErrorState, Field, Input, PageHeader, Skeleton } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { auth } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import { keys, useMe } from "@/lib/queries";
import type { Me } from "@/lib/types";

function ChangePassword() {
  const toast = useToast();
  const minLen = useSite().password_min_length;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const local: Record<string, string[]> = {};
    if (!current) local.current_password = ["Enter your current password."];
    if (next.length < minLen) local.new_password = [`Use at least ${minLen} characters.`];
    if (next !== confirm) local.confirm = ["Passwords don't match."];
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await auth.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast("Password changed");
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        const { __all__, ...rest } = err.fieldErrors;
        setErrors(rest);
        if (__all__) setFormError(__all__.join(" "));
      } else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate aria-labelledby="pw-heading">
      <h3 id="pw-heading" className="text-sm font-medium text-heading">
        Change password
      </h3>
      <Field label="Current password" error={errors.current_password}>
        {(p) => <Input {...p} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
      </Field>
      <Field label="New password" help={`At least ${minLen} characters.`} error={errors.new_password ?? errors.password}>
        {(p) => <Input {...p} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
      </Field>
      <Field label="Confirm new password" error={errors.confirm}>
        {(p) => <Input {...p} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
      </Field>
      {formError && (
        <p role="alert" className="text-sm font-medium text-bad">
          {formError}
        </p>
      )}
      <Button type="submit" loading={busy} className="self-start">
        Change password
      </Button>
    </form>
  );
}

function describeAgent(ua: string) {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iPhone"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return { label: os ? `${browser} on ${os}` : browser, mobile: /Android|iPhone|iPad|iPod|Mobile/.test(ua) };
}

function Sessions() {
  const toast = useToast();
  const q = useQuery({ queryKey: ["auth-sessions"], queryFn: () => auth.sessions() });
  const end = useMutation({
    mutationFn: (ids: number[]) => auth.endSessions(ids),
    onSuccess: () => {
      toast("Signed out of other devices");
      void q.refetch();
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const sessions = q.data?.data ?? [];
  const others = sessions.filter((s) => !s.is_current).map((s) => s.id);

  return (
    <section aria-labelledby="sessions-heading" className="flex flex-col gap-2">
      <h2 id="sessions-heading" className="text-lg">
        Active sessions
      </h2>
      <Card className="py-1">
        {q.isLoading && <Skeleton className="my-3 h-12" />}
        {q.error && <p className="py-3 text-sm text-muted">Couldn&apos;t load your sessions.</p>}
        <ul>
          {sessions.map((s) => {
            const { label, mobile } = describeAgent(s.user_agent);
            const Icon = mobile ? Smartphone : Monitor;
            return (
              <li key={s.id} className="flex min-h-14 items-center gap-3 border-b border-line-soft py-2 last:border-0">
                <Icon className="size-5 shrink-0 text-subtle" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {s.is_current ? "This device · " : ""}
                    {label}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {s.ip} · {s.is_current ? "now" : relativeTime(new Date(s.last_seen_at * 1000).toISOString())}
                  </p>
                </div>
                {s.is_current && <Chip tone="ok">Current</Chip>}
              </li>
            );
          })}
        </ul>
      </Card>
      {others.length > 0 && (
        <Button variant="outline" onClick={() => end.mutate(others)} loading={end.isPending} className="self-start">
          Sign out of all other devices
        </Button>
      )}
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-line-soft py-2 last:border-0">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        className="relative h-7 w-12 shrink-0 rounded-full bg-[#C4CBD4] transition-colors peer-checked:bg-primary peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary/50 after:absolute after:top-0.5 after:left-0.5 after:size-6 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
        aria-hidden
      />
    </label>
  );
}

function Reminders({ me }: { me: Me }) {
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: (reminders: Partial<Record<"class_reminders" | "deadline_reminders", boolean>>) =>
      api.patch<Me>("/api/v1/me", { reminders }),
    onMutate: (reminders) => {
      const prev = qc.getQueryData<Me>(keys.me);
      if (prev) qc.setQueryData<Me>(keys.me, { ...prev, profile: { ...prev.profile, ...reminders } });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.me, ctx.prev);
      toast(errorMessage(e), "error");
    },
    onSuccess: (updated) => qc.setQueryData(keys.me, updated),
  });

  return (
    <section aria-labelledby="notif-heading" className="flex flex-col gap-2">
      <h2 id="notif-heading" className="text-lg">
        Notifications
      </h2>
      <Card className="py-1">
        <Toggle
          label="Class reminders by email"
          description="Before each live class you're enrolled in"
          checked={me.profile.class_reminders}
          onChange={(v) => m.mutate({ class_reminders: v })}
        />
        <Toggle
          label="Deadline reminders by email"
          description="Before quizzes and assignments are due"
          checked={me.profile.deadline_reminders}
          onChange={(v) => m.mutate({ deadline_reminders: v })}
        />
      </Card>
    </section>
  );
}

export default function SecurityPage() {
  const site = useSite();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me, error, refetch } = useMe();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await auth.logout();
    } finally {
      qc.clear();
      router.replace("/login");
    }
  }

  if (error) {
    return (
      <AppPage>
        <ErrorState error={error} retry={refetch} />
      </AppPage>
    );
  }
  if (!me) return null;

  return (
    <AppPage>
      <PageHeader title="Account & security" back={{ href: "/profile", label: "Profile" }} />
      <div className="flex flex-col gap-6">
        <section aria-labelledby="signin-heading" className="flex flex-col gap-2">
          <h2 id="signin-heading" className="text-lg">
            Sign-in
          </h2>
          <Card className="flex flex-col gap-4">
            <ChangePassword />
            {site.flags.google_login && (
              <div className="flex min-h-12 items-center justify-between gap-3 border-t border-line-soft pt-3">
                <div>
                  <p className="text-sm font-medium">Google account</p>
                  <p className="text-xs text-muted">{me.google_connected ? "You can sign in with Google." : "Not connected"}</p>
                </div>
                <Chip tone={me.google_connected ? "ok" : "mute"}>{me.google_connected ? "Connected" : "Not connected"}</Chip>
              </div>
            )}
          </Card>
          {!me.email_verified && <Banner tone="warn">Verify your email address to keep your account secure.</Banner>}
        </section>

        <Sessions />
        <Reminders me={me} />

        <Button variant="danger" onClick={signOut} loading={signingOut} className="self-start">
          <LogOut className="size-4" aria-hidden /> Sign out
        </Button>
      </div>
    </AppPage>
  );
}
