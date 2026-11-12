"use client";

import { Mail, MessageCircle } from "lucide-react";

import { useSite } from "@/components/providers";
import { cn } from "@/components/ui";

/** Contact-support buttons from Site Settings (email and/or WhatsApp). */
export function SupportLinks({ className, subject }: { className?: string; subject?: string }) {
  const { support } = useSite();
  const wa = support.whatsapp.replace(/[^\d]/g, "");
  if (!support.email && !wa) return null;
  const btn =
    "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-primary bg-white px-4 text-[15px] font-medium text-primary hover:bg-primary-soft";
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row", className)}>
      {support.email && (
        <a className={btn} href={`mailto:${support.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`}>
          <Mail className="size-4" aria-hidden /> Contact support
        </a>
      )}
      {wa && (
        <a className={btn} href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="size-4" aria-hidden /> WhatsApp
        </a>
      )}
    </div>
  );
}
