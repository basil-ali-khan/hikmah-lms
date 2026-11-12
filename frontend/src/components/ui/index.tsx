"use client";

import { clsx, type ClassValue } from "clsx";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { forwardRef, useId } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ------------------------------------------------------------------ Button */

type Variant = "primary" | "outline" | "ghost" | "accent" | "danger" | "subtle";
type Size = "md" | "sm" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-strong disabled:bg-[#E6E9EE] disabled:text-muted",
  outline: "bg-white text-primary border-[1.5px] border-primary hover:bg-primary-soft",
  ghost: "bg-transparent text-primary hover:bg-primary-soft",
  accent: "bg-accent text-ink hover:brightness-95",
  danger: "bg-white text-bad border-[1.5px] border-[#D9A3A3] hover:bg-bad-soft",
  subtle: "bg-[#F2F4F7] text-ink hover:bg-[#E6E9EE]",
};
const sizes: Record<Size, string> = {
  sm: "min-h-9 px-3 text-sm rounded-lg",
  md: "min-h-12 px-4 text-[15px] rounded-[10px]",
  lg: "min-h-14 px-6 text-base rounded-xl",
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, block, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  block,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size; block?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ Form fields */

export function Label({ children, required, ...props }: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className="text-[13px] font-medium text-heading" {...props}>
      {children}
      {required && (
        <span className="text-bad" aria-hidden>
          {" "}
          *
        </span>
      )}
    </label>
  );
}

const inputBase =
  "w-full rounded-[10px] border border-[#C4CBD4] bg-white px-3.5 text-base text-ink placeholder:text-[#7A8491] focus:border-primary aria-[invalid=true]:border-bad disabled:bg-[#F6F7F9] disabled:text-subtle read-only:bg-[#F6F7F9]";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(inputBase, "h-12", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(inputBase, "min-h-28 py-3", className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(inputBase, "h-12 appearance-none bg-[length:16px] pr-9", className)} {...props}>
      {children}
    </select>
  );
});

/** Label + control + help + error, wired with ids for screen readers. */
export function Field({
  label,
  required,
  help,
  error,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  help?: string;
  error?: string | string[];
  children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const err = Array.isArray(error) ? error.join(" ") : error;
  const describedBy = [help && `${id}-help`, err && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children({ id, "aria-invalid": err ? true : undefined, "aria-describedby": describedBy })}
      {help && !err && (
        <p id={`${id}-help`} className="text-xs text-muted">
          {help}
        </p>
      )}
      {err && (
        <p id={`${id}-err`} className="text-xs text-bad" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2.5 text-[13px] leading-snug text-heading">
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--brand-primary)]" {...props} />
      <span>{label}</span>
    </label>
  );
}

/* ------------------------------------------------------------------ Surfaces */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] border border-line bg-white p-4", className)} {...props} />;
}

type Tone = "primary" | "accent" | "ok" | "warn" | "bad" | "mute";
const chipTones: Record<Tone, string> = {
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-[#5C4A00]",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  mute: "bg-[#EEF0F3] text-subtle",
};

export function Chip({ tone = "primary", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium", chipTones[tone], className)}
      {...props}
    />
  );
}

const bannerTones = {
  info: { cls: "bg-primary-soft text-info", Icon: Info },
  ok: { cls: "bg-ok-soft text-[#14532D]", Icon: CheckCircle2 },
  warn: { cls: "bg-warn-soft text-[#6B3500]", Icon: AlertTriangle },
  bad: { cls: "bg-bad-soft text-[#7F1D1D]", Icon: XCircle },
};

export function Banner({
  tone = "info",
  title,
  children,
  className,
  action,
}: {
  tone?: keyof typeof bannerTones;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  const { cls, Icon } = bannerTones[tone];
  return (
    <div className={cn("flex gap-2.5 rounded-xl px-3.5 py-3 text-[13px] leading-relaxed", cls, className)} role="status">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
      {action}
    </div>
  );
}

export function ProgressBar({ value, tone = "primary", label }: { value: number; tone?: "primary" | "ok"; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-[#E6E9EE]"
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Progress"}
    >
      <div className={cn("h-full rounded-full", tone === "ok" ? "bg-ok" : "bg-primary")} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-[#ECEEF1]", className)} aria-hidden />;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-muted" role="status">
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      {icon && <div className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">{icon}</div>}
      <h2 className="text-lg">{title}</h2>
      {children && <div className="max-w-sm text-sm text-subtle">{children}</div>}
      {action}
    </Card>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <Card className="flex flex-col items-start gap-2">
      <h2 className="text-base">Something went wrong</h2>
      <p className="text-sm text-subtle">{message}</p>
      {retry && (
        <Button size="sm" onClick={retry}>
          Try again
        </Button>
      )}
    </Card>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-1">
      {back && (
        <Link href={back.href} className="mb-1 inline-flex min-h-8 items-center text-sm font-medium text-primary">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-[22px] leading-tight md:text-[26px]">{title}</h1>
        {actions}
      </div>
      {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
    </div>
  );
}

export function Html({ html, className }: { html: string; className?: string }) {
  // Content is sanitized server-side (nh3 allow-list) before it reaches the browser.
  return <div className={cn("prose-hikmah", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
