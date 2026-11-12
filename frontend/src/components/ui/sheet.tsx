"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

/** Bottom sheet on phones, side panel / centred dialog on larger screens. Accessible (focus trap, Esc). */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = "bottom",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  side?: "bottom" | "center";
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(20,24,33,.5)]" />
        <Dialog.Content
          className={
            side === "bottom"
              ? "pb-safe fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-[20px] bg-white px-4 pt-3 md:inset-auto md:top-1/2 md:left-1/2 md:w-[520px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:pb-4"
              : "fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white p-5"
          }
        >
          {side === "bottom" && <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#C9D1DC] md:hidden" aria-hidden />}
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-heading text-lg font-bold">{title}</Dialog.Title>
              {description && <Dialog.Description className="text-sm text-muted">{description}</Dialog.Description>}
            </div>
            <Dialog.Close className="flex size-11 items-center justify-center rounded-[10px] bg-[#F2F4F7]" aria-label="Close">
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          <div className="-mx-4 overflow-y-auto px-4 pb-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
