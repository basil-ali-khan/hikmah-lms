"use client";

import { Check, ChevronDown, Copy } from "lucide-react";
import { useState } from "react";

import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui";
import type { BankAccount } from "@/lib/types";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary-soft"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast(`${label} copied`);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast("Couldn't copy. Select the text and copy it instead.", "error");
        }
      }}
    >
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CopyRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2 border-b border-line-soft py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{label}</p>
        <p className={cn("text-[15px] break-all text-ink", strong && "font-mono font-bold")}>{value}</p>
      </div>
      <CopyButton value={value} label={label} />
    </div>
  );
}

function AccountBody({ account, reference }: { account: BankAccount; reference: string }) {
  return (
    <div className="flex flex-col">
      <CopyRow label="Account title" value={account.account_title} />
      <CopyRow label="Account number / IBAN" value={account.account_number} strong />
      {account.bank_name && (
        <div className="border-b border-line-soft py-2">
          <p className="text-xs text-muted">Bank</p>
          <p className="text-[15px] text-ink">
            {account.bank_name}
            {account.branch && ` · ${account.branch}`}
          </p>
        </div>
      )}
      {account.swift_code && <CopyRow label="SWIFT / BIC" value={account.swift_code} />}
      {reference && <CopyRow label="Reference" value={reference} strong />}
      {account.instructions && <p className="pt-2 text-sm whitespace-pre-wrap text-subtle">{account.instructions}</p>}
    </div>
  );
}

/** Bank account cards: the first is open; others expand on tap. */
export function BankDetails({ accounts, reference }: { accounts: BankAccount[]; reference: string }) {
  if (!accounts.length) {
    return <p className="text-sm text-subtle">Bank details aren&apos;t available yet. Please contact support.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {accounts.map((a, i) => (
        <details key={a.id} open={i === 0} className="group rounded-xl border border-line bg-white px-3.5 py-1 open:border-primary">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
            <span className="font-heading font-bold text-ink">
              {a.display_name || a.bank_name} · {a.currency}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted">
              <span className="group-open:hidden">Tap to show details</span>
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
            </span>
          </summary>
          <div className="pb-2">
            <AccountBody account={a} reference={reference} />
          </div>
        </details>
      ))}
    </div>
  );
}
