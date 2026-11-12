"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, Input } from "@/components/ui";

/** Certificate ID lookup. Navigates to /verify/<code>; the result page is server-rendered. */
export function VerifyForm({ defaultValue = "", autoFocus = false }: { defaultValue?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState(defaultValue);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex w-full flex-col gap-3 text-left"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const clean = code.trim().toUpperCase().replace(/\s+/g, "");
        if (!/^[A-Z0-9-]{4,40}$/.test(clean)) {
          setError("Enter the certificate ID exactly as printed, e.g. HKM-XXXX-XXXX.");
          return;
        }
        setError("");
        setBusy(true);
        router.push(`/verify/${encodeURIComponent(clean)}`);
      }}
    >
      <Field label="Certificate ID" error={error || undefined}>
        {(a) => (
          <Input
            {...a}
            name="code"
            placeholder="HKM-XXXX-XXXX"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            autoFocus={autoFocus}
            className="font-mono uppercase"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setBusy(false);
            }}
          />
        )}
      </Field>
      <Button type="submit" block loading={busy}>
        Verify
      </Button>
    </form>
  );
}
