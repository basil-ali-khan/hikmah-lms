"use client";

import { useSite } from "@/components/providers";
import { cn } from "@/components/ui";

/** Minimum length comes from the backend (PASSWORD_MIN_LENGTH), never hardcoded. */
export function usePasswordMin() {
  return useSite().password_min_length;
}

/** Plain client-side hint only — the server is the authority (length, common/breached password checks). */
export function passwordScore(pw: string, min = 10): { score: 0 | 1 | 2 | 3; label: string } {
  if (!pw) return { score: 0, label: "" };
  const variety = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (pw.length < min) return { score: 1, label: `Too short · use at least ${min} characters` };
  if (pw.length >= 12 && variety >= 3) return { score: 3, label: "Strong · 12+ characters with a good mix" };
  if (pw.length >= 12 || variety >= 3) return { score: 2, label: "Fair · longer passwords or a mix of characters are safer" };
  return { score: 1, label: "Weak · try 12+ characters with numbers and symbols" };
}

export function PasswordStrength({ password, id }: { password: string; id?: string }) {
  const min = usePasswordMin();
  const { score, label } = passwordScore(password, min);
  if (!password) {
    return (
      <p id={id} className="text-xs text-muted">
        Use at least {min} characters. Avoid common passwords.
      </p>
    );
  }
  const tone = score === 3 ? "bg-ok" : score === 2 ? "bg-[#C77700]" : "bg-bad";
  return (
    <div className="flex flex-col gap-1.5" id={id}>
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= score ? tone : "bg-[#E6E9EE]")} />
        ))}
      </div>
      <p className="text-xs text-subtle" aria-live="polite">
        {label}
      </p>
    </div>
  );
}
