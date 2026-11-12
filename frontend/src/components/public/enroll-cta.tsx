"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CoursePrice } from "@/components/course/course-card";
import { LocalDateTime } from "@/components/local-time";
import { useSite } from "@/components/providers";
import { Button, ButtonLink, Skeleton, cn } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { auth } from "@/lib/auth";
import { keys, useCourse, useMe } from "@/lib/queries";
import type { CourseDetail, EnrollmentDetail } from "@/lib/types";

type Props = {
  slug: string;
  /** Server-rendered fallbacks so price and label show before the per-user state loads. */
  course: Pick<CourseDetail, "title" | "is_free" | "price" | "currency" | "enrollment_mode" | "enrollment_opens_at" | "eligibility">;
  layout: "bar" | "card";
};

function Note({ children, tone = "mute" }: { children: React.ReactNode; tone?: "mute" | "bad" | "ok" }) {
  return (
    <p className={cn("text-xs leading-snug", tone === "bad" ? "text-bad" : tone === "ok" ? "text-ok" : "text-subtle")}>{children}</p>
  );
}

/** Enroll button for the course page. The server decides `enroll.state`; this only renders it. */
export function EnrollCta({ slug, course: fallback, layout }: Props) {
  const site = useSite();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: course, isLoading, isError } = useCourse(slug);
  const { data: me } = useMe();
  const [successOpen, setSuccessOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState("");
  const [resent, setResent] = useState(false);

  const c = course ?? { ...fallback, enroll: { state: "signed_out" as const } };
  const here = `/courses/${slug}`;

  const enroll = useMutation({
    mutationFn: () => api.post<EnrollmentDetail>(`/api/v1/courses/${slug}/enroll`),
    onSuccess: (e) => {
      setError("");
      qc.invalidateQueries({ queryKey: keys.course(slug) });
      qc.invalidateQueries({ queryKey: keys.dashboard });
      qc.invalidateQueries({ queryKey: keys.enrollments });
      if (e.status === "active") setSuccessOpen(true);
      else if (e.status === "pending_approval") setRequested(true);
      else if (e.status === "pending_payment") router.push(`/payments/${e.id}`);
    },
    onError: (err) => {
      setError(errorMessage(err));
      qc.invalidateQueries({ queryKey: keys.course(slug) });
    },
  });

  const resend = useMutation({
    mutationFn: () => auth.resendVerification(me!.email),
    onSuccess: () => {
      setResent(true);
      toast("Verification email sent.");
    },
    onError: (err) => toast(errorMessage(err), "error"),
  });

  let action: React.ReactNode;
  let note: React.ReactNode = null;
  const state = isError ? "signed_out" : c.enroll.state;

  if (isLoading) {
    action = <Skeleton className="h-12 w-full" />;
  } else if (requested || state === "pending_approval") {
    action = (
      <Button block disabled>
        {requested ? "Request sent" : "Awaiting approval"}
      </Button>
    );
    note = <Note>We&apos;ll email you when the institute reviews your request.</Note>;
  } else {
    switch (state) {
      case "signed_out":
        action = (
          <ButtonLink href={`/login?next=${encodeURIComponent(here)}`} block>
            Sign in to enroll
          </ButtonLink>
        );
        note = <Note>New here? You can create an account from the sign-in page.</Note>;
        break;
      case "email_unverified":
        action = (
          <Button block variant="outline" loading={resend.isPending} disabled={resent || !me} onClick={() => resend.mutate()}>
            {resent ? "Verification email sent" : "Resend verification email"}
          </Button>
        );
        note = <Note>Verify your email address to enroll. Check your inbox for the link.</Note>;
        break;
      case "profile_incomplete":
        action = (
          <ButtonLink href={`/complete-profile?next=${encodeURIComponent(here)}`} block>
            Complete your profile to enroll
          </ButtonLink>
        );
        break;
      case "not_eligible":
        action = (
          <Button block disabled>
            Not open to your profile
          </Button>
        );
        note = (
          <Note>
            This course is limited by the institute&apos;s eligibility settings{c.eligibility ? ` (${c.eligibility})` : ""}.
          </Note>
        );
        break;
      case "full":
        action = (
          <Button block disabled>
            Course full
          </Button>
        );
        note = <Note>All seats have been taken.</Note>;
        break;
      case "enrollment_closed":
        action = (
          <Button block disabled>
            Enrollment closed
          </Button>
        );
        note = <Note>Enrollment for this course has closed.</Note>;
        break;
      case "enrollment_not_open":
        action = (
          <Button block disabled>
            Enrollment not open yet
          </Button>
        );
        note = c.enrollment_opens_at ? (
          <Note>
            Opens <LocalDateTime iso={c.enrollment_opens_at} />
          </Note>
        ) : (
          <Note>Enrollment hasn&apos;t opened yet.</Note>
        );
        break;
      case "not_available":
        action = (
          <Button block disabled>
            Not available
          </Button>
        );
        note = <Note>This course isn&apos;t open for enrollment.</Note>;
        break;
      case "can_enroll": {
        const label = c.is_free ? (c.enrollment_mode === "approval" ? "Request to join" : "Enroll free") : "Enroll now";
        action = (
          <Button block loading={enroll.isPending} onClick={() => enroll.mutate()}>
            {label}
          </Button>
        );
        if (course?.enroll.previously_rejected) {
          note = <Note>Your earlier request wasn&apos;t approved. You can apply again.</Note>;
        } else if (!c.is_free) {
          note = <Note>Pay by bank transfer and upload your receipt on the next screen.</Note>;
        }
        break;
      }
      case "enrolled":
        action = (
          <ButtonLink href={`/learn/${slug}`} block>
            Continue learning
          </ButtonLink>
        );
        break;
      case "pending_payment":
        action = (
          <ButtonLink href={`/payments/${course?.enroll.enrollment_id ?? ""}`} block>
            Complete payment
          </ButtonLink>
        );
        note = <Note>Already uploaded a receipt? View its status there — we usually verify within {site.payment_review_eta}.</Note>;
        break;
      case "expired":
        action = (
          <Button block disabled>
            Access expired
          </Button>
        );
        note = <Note>Your access to this course has ended. Please contact the institute to extend it.</Note>;
        break;
      case "revoked":
        action = (
          <Button block disabled>
            Access revoked
          </Button>
        );
        note = <Note tone="bad">Your access to this course was revoked. Please contact the institute.</Note>;
        break;
      case "staff":
        action = (
          <ButtonLink href={`/learn/${slug}`} block variant="outline">
            Open course
          </ButtonLink>
        );
        note = <Note>You teach or manage this course.</Note>;
        break;
      default:
        action = null;
    }
  }

  const errorNote = error ? (
    <p className="text-xs text-bad" role="alert">
      {error}
    </p>
  ) : null;

  const sheet = (
    <Sheet open={successOpen} onOpenChange={setSuccessOpen} title="You're enrolled!">
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-ok-soft text-ok">
          <CheckCircle2 className="size-8" aria-hidden />
        </div>
        <p className="text-[15px] text-subtle">
          <b className="text-ink">{c.title}</b> is now in your courses. We&apos;ve emailed you the details.
        </p>
        <ButtonLink href={`/learn/${slug}`} block>
          Start learning
        </ButtonLink>
      </div>
    </Sheet>
  );

  if (layout === "bar") {
    return (
      <div className="flex flex-col gap-1.5" aria-live="polite">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <CoursePrice course={c} />
          </div>
          <div className="min-w-0 flex-1">{action}</div>
        </div>
        {errorNote ?? note}
        {sheet}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <div className="text-2xl">
        <CoursePrice course={c} />
      </div>
      {action}
      {errorNote ?? note}
      {sheet}
    </div>
  );
}
