"use client";

import { Camera, FileText, Paperclip, X } from "lucide-react";
import { useId, useRef } from "react";

import { Button } from "@/components/ui";
import { fileSize } from "@/lib/format";

const TYPE_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "application/zip": "ZIP",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WEBP",
  "image/heic": "HEIC",
};

export function describeTypes(types: string[]) {
  const labels = [...new Set(types.map((t) => TYPE_LABELS[t] ?? t.split("/")[1]?.toUpperCase() ?? t))];
  return labels.join(", ");
}

/** Returns an error message, or null when the file is acceptable. Empty MIME (some Android pickers) is left to the server. */
export function checkFile(file: File, allowedTypes: string[], maxMb: number): string | null {
  if (file.type && allowedTypes.length && !allowedTypes.includes(file.type)) {
    return `This file type isn't allowed. Use ${describeTypes(allowedTypes)}.`;
  }
  if (file.size > maxMb * 1024 * 1024) return `This file is ${fileSize(file.size)}. The maximum is ${maxMb} MB.`;
  return null;
}

/** "Take photo" + "Choose file" buttons and the selected-file row. Validation is up to the caller via `onSelect`. */
export function FilePicker({
  label,
  accept,
  file,
  onSelect,
  onClear,
  allowCamera = true,
  hint,
  error,
  disabled,
}: {
  label: string;
  accept: string;
  file: File | null;
  onSelect: (file: File) => void;
  onClear: () => void;
  allowCamera?: boolean;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
}) {
  const id = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (f) onSelect(f);
  }

  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined}>
      <p id={`${id}-label`} className="text-[13px] font-medium text-heading">
        {label}
      </p>
      {hint && (
        <p id={`${id}-hint`} className="-mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
          <FileText className="size-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted">{fileSize(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="flex size-11 items-center justify-center rounded-[10px] bg-[#F2F4F7]"
            aria-label={`Remove ${file.name}`}
            disabled={disabled}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          {allowCamera && (
            <Button type="button" variant="outline" className="flex-1 md:hidden" onClick={() => cameraRef.current?.click()} disabled={disabled}>
              <Camera className="size-4" aria-hidden /> Take photo
            </Button>
          )}
          <Button type="button" variant="outline" className="flex-1 md:flex-none" onClick={() => fileRef.current?.click()} disabled={disabled}>
            <Paperclip className="size-4" aria-hidden /> Choose file
          </Button>
        </div>
      )}
      {allowCamera && (
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={handle}
          data-testid="camera-input"
        />
      )}
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-label={`${label}: choose file`}
        onChange={handle}
        data-testid="file-input"
      />
      {error && (
        <p className="text-xs text-bad" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
