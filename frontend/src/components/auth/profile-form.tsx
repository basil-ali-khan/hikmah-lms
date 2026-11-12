"use client";

import Link from "next/link";
import { useState } from "react";

import { useSite } from "@/components/providers";
import { Banner, Button, Checkbox, Field, Input, Select, Textarea, cn } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { userTimeZone } from "@/lib/format";
import type { ProfileField } from "@/lib/types";

import { COUNTRIES } from "./countries";

export type ProfileValue = string | string[];

export type ProfilePayload = {
  full_name: string;
  data: Record<string, ProfileValue>;
  consent: boolean;
  timezone: string;
};

type Props = {
  fields: ProfileField[];
  initial: { full_name: string; data: Record<string, unknown> };
  /** Show the privacy-consent checkbox (required) — true when the user hasn't consented yet. */
  requireConsent: boolean;
  /** Persist the payload. Throw an ApiError with fieldErrors (keyed by field key) to show them inline. */
  onSubmit: (payload: ProfilePayload) => Promise<void>;
  submitLabel?: string;
  showFullName?: boolean;
};

function isEmpty(v: ProfileValue | undefined) {
  return v === undefined || (Array.isArray(v) ? v.length === 0 : !v.trim());
}

function toValue(field: ProfileField, raw: unknown): ProfileValue {
  if (field.type === "multiselect") return Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];
  if (raw === null || raw === undefined) return "";
  return String(raw);
}

const placeholders: Partial<Record<ProfileField["type"], string>> = {
  phone: "+92 300 1234567",
};

/** Renders the admin-defined profile fields (Site Settings → Profile fields) and maps them to PATCH /me. */
export function ProfileForm({
  fields,
  initial,
  requireConsent,
  onSubmit,
  submitLabel = "Save and continue",
  showFullName = true,
}: Props) {
  const site = useSite();
  const [fullName, setFullName] = useState(initial.full_name ?? "");
  const [values, setValues] = useState<Record<string, ProfileValue>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, toValue(f, initial.data?.[f.key])])),
  );
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const lockedKeys = new Set(
    fields.filter((f) => f.locked_after_save && !isEmpty(toValue(f, initial.data?.[f.key]))).map((f) => f.key),
  );

  function set(key: string, value: ProfileValue) {
    setValues((v) => ({ ...v, [key]: value }));
    clearError(key);
  }

  function clearError(key: string) {
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const local: Record<string, string[]> = {};
    if (showFullName && fullName.trim().length < 2) local.full_name = ["Please enter your full name."];
    for (const f of fields) {
      if (f.required && !lockedKeys.has(f.key) && isEmpty(values[f.key])) local[f.key] = ["This field is required."];
    }
    if (requireConsent && !consent) local.consent = ["Please give your consent to continue."];
    if (Object.keys(local).length) {
      setErrors(local);
      setFormError("Please fix the highlighted fields.");
      return;
    }

    const data: Record<string, ProfileValue> = {};
    for (const f of fields) {
      if (lockedKeys.has(f.key)) continue; // read-only; the server refuses changes anyway
      const v = values[f.key];
      data[f.key] = Array.isArray(v) ? v : v.trim();
    }
    setBusy(true);
    try {
      await onSubmit({
        full_name: showFullName ? fullName.trim() : initial.full_name,
        data,
        consent: requireConsent ? consent : true,
        timezone: userTimeZone(),
      });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors(err.fieldErrors);
        setFormError(err.message || "Please fix the highlighted fields.");
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  function renderControl(f: ProfileField, a: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) {
    const locked = lockedKeys.has(f.key);
    const v = values[f.key] ?? "";
    const str = Array.isArray(v) ? "" : v;
    const common = { ...a, name: f.key, required: f.required && !locked };
    switch (f.type) {
      case "textarea":
        return <Textarea {...common} value={str} readOnly={locked} onChange={(e) => set(f.key, e.target.value)} />;
      case "select":
        if (locked) return <Input {...common} value={str} readOnly />;
        return (
          <Select {...common} value={str} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">Select…</option>
            {f.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        );
      case "country":
        if (locked) {
          return <Input {...common} value={COUNTRIES.find((c) => c.code === str)?.name ?? str} readOnly />;
        }
        return (
          <Select {...common} value={str} autoComplete="country" onChange={(e) => set(f.key, e.target.value)}>
            <option value="">Select a country…</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        );
      case "date":
        return (
          <Input
            {...common}
            type="date"
            value={str}
            readOnly={locked}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => set(f.key, e.target.value)}
          />
        );
      case "phone":
        return (
          <Input
            {...common}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={placeholders.phone}
            value={str}
            readOnly={locked}
            onChange={(e) => set(f.key, e.target.value)}
          />
        );
      case "number":
        return (
          <Input
            {...common}
            type="number"
            inputMode="decimal"
            value={str}
            readOnly={locked}
            onChange={(e) => set(f.key, e.target.value)}
          />
        );
      default:
        return <Input {...common} type="text" value={str} readOnly={locked} onChange={(e) => set(f.key, e.target.value)} />;
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && (
        <div role="alert">
          <Banner tone="bad">{formError}</Banner>
        </div>
      )}
      {errors.__all__ && !formError && (
        <div role="alert">
          <Banner tone="bad">{errors.__all__.join(" ")}</Banner>
        </div>
      )}

      {showFullName && (
        <Field label="Full name" required error={errors.full_name}>
          {(a) => (
            <Input
              {...a}
              name="full_name"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                clearError("full_name");
              }}
            />
          )}
        </Field>
      )}

      {fields.map((f) => {
        const locked = lockedKeys.has(f.key);
        const help = locked
          ? `${f.help_text ? `${f.help_text}. ` : ""}This can't be changed once saved. Contact support if it's wrong.`
          : f.help_text;
        if (f.type === "multiselect") {
          const selected = (values[f.key] as string[]) ?? [];
          const groupId = `pf-${f.key}`;
          const err = errors[f.key]?.join(" ");
          return (
            <fieldset key={f.key} className="flex flex-col gap-1.5" aria-describedby={err ? `${groupId}-err` : help ? `${groupId}-help` : undefined}>
              <legend className="mb-1.5 text-[13px] font-medium text-heading">
                {f.label}
                {f.required && !locked && (
                  <span className="text-bad" aria-hidden>
                    {" "}
                    *
                  </span>
                )}
              </legend>
              <div className={cn("flex flex-col gap-2", locked && "opacity-80")}>
                {f.options.map((o) => (
                  <Checkbox
                    key={o}
                    name={f.key}
                    value={o}
                    label={o}
                    checked={selected.includes(o)}
                    disabled={locked}
                    onChange={(e) => set(f.key, e.target.checked ? [...selected, o] : selected.filter((x) => x !== o))}
                  />
                ))}
              </div>
              {help && !err && (
                <p id={`${groupId}-help`} className="text-xs text-muted">
                  {help}
                </p>
              )}
              {err && (
                <p id={`${groupId}-err`} className="text-xs text-bad" role="alert">
                  {err}
                </p>
              )}
            </fieldset>
          );
        }
        return (
          <Field key={f.key} label={f.label} required={f.required && !locked} help={help || undefined} error={errors[f.key]}>
            {(a) => renderControl(f, a)}
          </Field>
        );
      })}

      {requireConsent && (
        <div className="flex flex-col gap-1">
          <Checkbox
            name="consent"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              if (e.target.checked) clearError("consent");
            }}
            aria-invalid={errors.consent ? true : undefined}
            label={
              <>
                I consent to {site.institute_name} storing this information as described in the{" "}
                <Link href="/privacy" className="font-medium text-primary underline" target="_blank">
                  Privacy policy
                </Link>
                .
              </>
            }
          />
          {errors.consent && (
            <p className="text-xs text-bad" role="alert">
              {errors.consent.join(" ")}
            </p>
          )}
        </div>
      )}

      <Button type="submit" block loading={busy} className="mt-1">
        {submitLabel}
      </Button>
    </form>
  );
}
