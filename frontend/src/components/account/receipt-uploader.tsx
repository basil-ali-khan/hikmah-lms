"use client";

import imageCompression from "browser-image-compression";
import { Camera, FileText, Paperclip, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button, Field, Input, Select, cn } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { fileSize } from "@/lib/format";
import type { BankAccount } from "@/lib/types";

/** Matches the server's ALLOWED_UPLOAD_TYPES (content is re-checked server-side). */
export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
const COMPRESSIBLE = ["image/jpeg", "image/png", "image/webp"];
export const COMPRESS_OPTIONS = { maxSizeMB: 1.5, maxWidthOrHeight: 1600, useWebWorker: true };
/** Phone photos can be huge before compression; refuse anything absurd up front. */
const MAX_RAW_IMAGE_MB = 40;

export type PreparedReceipt = { file: File; originalSize: number; compressed: boolean };

export class ReceiptError extends Error {}

/** Validates type/size and compresses photos to ≤1.5 MB / 1600 px. Throws ReceiptError with a user-facing message. */
export async function prepareReceipt(file: File, maxMb = 10): Promise<PreparedReceipt> {
  const limit = maxMb * 1024 * 1024;
  if (!RECEIPT_TYPES.includes(file.type)) {
    throw new ReceiptError("Please upload a photo (JPG, PNG, WEBP, HEIC) or a PDF.");
  }
  if (COMPRESSIBLE.includes(file.type)) {
    if (file.size > MAX_RAW_IMAGE_MB * 1024 * 1024) {
      throw new ReceiptError(`This photo is ${fileSize(file.size)}. Please use one under ${MAX_RAW_IMAGE_MB} MB.`);
    }
    let out: File = file;
    try {
      const blob = await imageCompression(file, { ...COMPRESS_OPTIONS, fileType: file.type });
      out = blob instanceof File ? blob : new File([blob], file.name, { type: file.type });
      if (out.name !== file.name) out = new File([out], file.name, { type: out.type || file.type });
    } catch {
      out = file; // compression is best-effort; fall back to the original
    }
    if (out.size > limit) throw new ReceiptError(`This photo is still ${fileSize(out.size)} after compression. The maximum is ${maxMb} MB.`);
    return { file: out, originalSize: file.size, compressed: out !== file && out.size < file.size };
  }
  if (file.size > limit) throw new ReceiptError(`This file is ${fileSize(file.size)}. The maximum is ${maxMb} MB.`);
  return { file, originalSize: file.size, compressed: false };
}

export function buildPaymentFormData(v: {
  receipt: File;
  amount: string;
  transactionRef: string;
  paidOn: string;
  bankAccount?: string | number | null;
}) {
  const fd = new FormData();
  fd.append("receipt", v.receipt, v.receipt.name);
  fd.append("amount", v.amount.trim());
  fd.append("transaction_ref", v.transactionRef.trim());
  if (v.paidOn) fd.append("paid_on", v.paidOn);
  if (v.bankAccount) fd.append("bank_account", String(v.bankAccount));
  return fd;
}

/** Server error codes → the field they belong to. */
const CODE_FIELD: Record<string, string> = {
  invalid_amount: "amount",
  invalid_date: "paid_on",
  file_required: "receipt",
  file_too_large: "receipt",
  file_type: "receipt",
};

function todayLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ReceiptUploader({
  price,
  currency,
  bankAccounts,
  maxMb = 10,
  onSubmit,
  submitLabel = "Submit for verification",
}: {
  price: string;
  currency: string;
  bankAccounts: BankAccount[];
  maxMb?: number;
  /** Receives the multipart body; throw an ApiError to show field errors. */
  onSubmit: (fd: FormData) => Promise<void>;
  submitLabel?: string;
}) {
  const id = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [receipt, setReceipt] = useState<PreparedReceipt | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [amount, setAmount] = useState(() => String(Number(price) || ""));
  const [transactionRef, setTransactionRef] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [maxDate] = useState(todayLocal);
  const [bankAccount, setBankAccount] = useState(() => (bankAccounts.length === 1 ? String(bankAccounts[0].id) : ""));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Object URLs for previews are released when replaced or on unmount.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function accept(file: File) {
    setErrors((e) => ({ ...e, receipt: "" }));
    setProcessing(true);
    try {
      const prepared = await prepareReceipt(file, maxMb);
      setReceipt(prepared);
      const canPreview = prepared.file.type.startsWith("image/") && prepared.file.type !== "image/heic";
      setPreview(canPreview && typeof URL.createObjectURL === "function" ? URL.createObjectURL(prepared.file) : null);
    } catch (e) {
      setReceipt(null);
      setPreview(null);
      setErrors((x) => ({ ...x, receipt: e instanceof ReceiptError ? e.message : "We couldn't read this file. Try another one." }));
    } finally {
      setProcessing(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void accept(f);
  }

  function clear() {
    setReceipt(null);
    setPreview(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const next: Record<string, string> = {};
    if (!receipt) next.receipt = "Add a photo or PDF of your receipt.";
    if (!(Number(amount) > 0)) next.amount = "Enter the amount you paid.";
    if (paidOn && paidOn > maxDate) next.paid_on = "Payment date can't be in the future.";
    setErrors(next);
    if (Object.keys(next).length || !receipt) return;

    setBusy(true);
    try {
      await onSubmit(buildPaymentFormData({ receipt: receipt.file, amount, transactionRef, paidOn, bankAccount }));
    } catch (err) {
      if (err instanceof ApiError) {
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.fieldErrors)) mapped[k] = v.join(" ");
        const field = CODE_FIELD[err.code];
        if (field) mapped[field] = err.message;
        setErrors(mapped);
        if (!field && !Object.keys(mapped).length) setFormError(err.message);
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || processing;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate aria-label="Upload payment receipt">
      <div className="flex flex-col gap-2" role="group" aria-labelledby={`${id}-r`} aria-describedby={`${id}-rh`}>
        <p id={`${id}-r`} className="text-[13px] font-medium text-heading">
          Add your payment receipt<span className="text-bad" aria-hidden> *</span>
        </p>
        <p id={`${id}-rh`} className="-mt-1 text-xs text-muted">
          Photo or PDF · max {maxMb} MB
        </p>

        {receipt ? (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
              <img src={preview} alt="Receipt preview" className="size-16 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-primary-soft">
                <FileText className="size-6 text-primary" aria-hidden />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{receipt.file.name}</p>
              <p className="text-xs text-muted">
                {fileSize(receipt.file.size)}
                {receipt.compressed && ` · compressed from ${fileSize(receipt.originalSize)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={clear}
              className="flex size-11 items-center justify-center rounded-[10px] bg-[#F2F4F7]"
              aria-label="Remove receipt"
              disabled={disabled}
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2 md:hidden">
              <Button type="button" variant="outline" className="flex-1" onClick={() => cameraRef.current?.click()} disabled={disabled}>
                <Camera className="size-4" aria-hidden /> Take photo
              </Button>
              <Button type="button" variant="outline" className="flex-1" onClick={() => fileRef.current?.click()} disabled={disabled}>
                <Paperclip className="size-4" aria-hidden /> Choose file
              </Button>
            </div>
            <div
              className={cn(
                "hidden flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm text-subtle md:flex",
                dragging ? "border-primary bg-primary-soft" : "border-line bg-white",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void accept(f);
              }}
            >
              <Upload className="size-6 text-primary" aria-hidden />
              <p>
                Drag a photo or PDF here or{" "}
                <button type="button" className="font-medium text-primary underline" onClick={() => fileRef.current?.click()} disabled={disabled}>
                  browse files
                </button>
              </p>
            </div>
          </>
        )}
        {processing && (
          <p className="text-xs text-muted" role="status">
            Preparing your file…
          </p>
        )}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={onPick}
          data-testid="receipt-camera"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose receipt file"
          onChange={onPick}
          data-testid="receipt-file"
        />
        {errors.receipt && (
          <p className="text-xs text-bad" role="alert">
            {errors.receipt}
          </p>
        )}
      </div>

      <Field label="Transaction reference / ID" help="From your bank app or slip, if there is one." error={errors.transaction_ref}>
        {(p) => <Input {...p} value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} maxLength={120} autoComplete="off" />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Amount paid (${currency})`} required error={errors.amount}>
          {(p) => (
            <Input
              {...p}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          )}
        </Field>
        <Field label="Payment date" error={errors.paid_on}>
          {(p) => <Input {...p} type="date" max={maxDate} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />}
        </Field>
      </div>
      {bankAccounts.length > 1 && (
        <Field label="Paid to" error={errors.bank_account}>
          {(p) => (
            <Select {...p} value={bankAccount} onChange={(e) => setBankAccount(e.target.value)}>
              <option value="">Select the account you paid into</option>
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.display_name || b.bank_name} · {b.currency}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      {formError && (
        <p role="alert" className="text-sm font-medium text-bad">
          {formError}
        </p>
      )}
      <Button type="submit" size="lg" block loading={busy} disabled={processing} className="md:w-auto md:self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
