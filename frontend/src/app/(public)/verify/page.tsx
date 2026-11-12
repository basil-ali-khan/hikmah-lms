import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { VerifyForm } from "@/components/public/verify-form";

export const metadata: Metadata = {
  title: "Verify a certificate",
  description: "Check that a certificate is genuine by entering its certificate ID.",
};

export default function VerifyPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 px-4 py-10 text-center md:py-16">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary">
        <ShieldCheck className="size-8" aria-hidden />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] md:text-[32px]">Verify a certificate</h1>
        <p className="text-[15px] text-subtle">Enter the certificate ID printed on the certificate, or scan its QR code.</p>
      </div>
      <VerifyForm />
    </div>
  );
}
