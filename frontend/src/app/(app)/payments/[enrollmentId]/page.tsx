"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, Clock, PartyPopper } from "lucide-react";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";

import { BankDetails, CopyButton } from "@/components/account/bank-details";
import { ReceiptUploader } from "@/components/account/receipt-uploader";
import { SupportLinks } from "@/components/account/support-links";
import { AppPage } from "@/components/app-shell";
import { useSite } from "@/components/providers";
import { LocalDateTime } from "@/components/local-time";
import { useToast } from "@/components/ui/toast";
import { Banner, Button, ButtonLink, Card, Chip, EmptyState, ErrorState, PageHeader, Skeleton, cn } from "@/components/ui";
import { ApiError, api, errorMessage, openSignedFile } from "@/lib/api";
import { formatDate, money } from "@/lib/format";
import { keys, useEnrollment } from "@/lib/queries";
import type { EnrollmentDetail, Payment } from "@/lib/types";

type Step = { label: string; detail?: React.ReactNode; state: "done" | "current" | "todo" | "bad" | "warn" };

function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col" aria-label="Payment progress">
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex gap-3 pb-4 last:pb-0">
          {i < steps.length - 1 && <span className="absolute top-7 bottom-0 left-[13px] w-0.5 bg-line" aria-hidden />}
          <span
            className={cn(
              "z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2",
              s.state === "done" && "border-ok bg-ok text-white",
              s.state === "current" && "border-primary bg-primary-soft text-primary",
              s.state === "warn" && "border-warn bg-warn-soft text-warn",
              s.state === "bad" && "border-bad bg-bad-soft text-bad",
              s.state === "todo" && "border-line bg-white",
            )}
            aria-hidden
          >
            {s.state === "done" ? <Check className="size-4" /> : s.state === "current" ? <Clock className="size-3.5" /> : null}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className={cn("text-sm font-medium", s.state === "todo" ? "text-muted" : "text-ink")}>
              {s.label}
              <span className="sr-only">
                {s.state === "done" ? " (done)" : s.state === "current" ? " (in progress)" : s.state === "todo" ? " (not yet)" : ""}
              </span>
            </p>
            {s.detail && <p className="text-xs text-muted">{s.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function stepsFor(e: EnrollmentDetail, p: Payment | null): Step[] {
  const submitted: Step = {
    label: "Receipt submitted",
    detail: p ? <LocalDateTime iso={p.created_at} /> : undefined,
    state: p ? "done" : "todo",
  };
  const unlocked = e.timeline.find((t) => t.to_status === "active");
  if (e.status === "active") {
    return [
      submitted,
      { label: "Payment verified", detail: p?.reviewed_at ? <LocalDateTime iso={p.reviewed_at} /> : undefined, state: "done" },
      { label: "Course unlocked", detail: unlocked ? <LocalDateTime iso={unlocked.at} /> : undefined, state: "done" },
    ];
  }
  if (p?.status === "resubmit") {
    return [
      submitted,
      { label: "Resubmission requested", detail: p.reviewed_at ? <LocalDateTime iso={p.reviewed_at} /> : undefined, state: "warn" },
      { label: "Course unlocked", state: "todo" },
    ];
  }
  if (p?.status === "rejected") {
    return [
      submitted,
      { label: "Payment rejected", detail: p.reviewed_at ? <LocalDateTime iso={p.reviewed_at} /> : undefined, state: "bad" },
      { label: "Course unlocked", state: "todo" },
    ];
  }
  return [
    submitted,
    { label: "Being verified", detail: `Usually within ${e.review_eta}`, state: p ? "current" : "todo" },
    { label: "Course unlocked", detail: "You'll get an email", state: "todo" },
  ];
}

function statusChip(e: EnrollmentDetail, p: Payment | null) {
  if (e.status === "active") return <Chip tone="ok">Approved</Chip>;
  if (e.status === "pending_approval") return <Chip tone="warn">Awaiting approval</Chip>;
  if (e.status === "rejected") return <Chip tone="bad">Rejected</Chip>;
  if (e.status === "expired") return <Chip tone="mute">Expired</Chip>;
  if (e.status === "revoked") return <Chip tone="bad">Access removed</Chip>;
  if (p?.status === "pending") return <Chip tone="warn">Pending</Chip>;
  if (p?.status === "resubmit") return <Chip tone="bad">Action needed</Chip>;
  if (p?.status === "rejected") return <Chip tone="bad">Rejected</Chip>;
  return <Chip tone="primary">Awaiting payment</Chip>;
}

function Remark({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="mt-1 whitespace-pre-wrap italic">
      “{text}” <span className="not-italic">— Admin remark</span>
    </p>
  );
}

export default function PaymentDetailPage() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const site = useSite();
  const { data: e, isLoading, error, refetch } = useEnrollment(enrollmentId);
  const [startNew, setStartNew] = useState(false);
  const [openingReceipt, setOpeningReceipt] = useState(false);
  const uploadRef = useRef<HTMLElement>(null);

  if (isLoading) {
    return (
      <AppPage>
        <div className="flex flex-col gap-3" aria-label="Loading payment">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-28" />
          <Skeleton className="h-64" />
        </div>
      </AppPage>
    );
  }
  if (error || !e) {
    const status = error instanceof ApiError ? error.status : 0;
    return (
      <AppPage>
        <PageHeader title="Payment" back={{ href: "/payments", label: "Payments" }} />
        {status === 403 || status === 404 ? (
          <EmptyState title="Enrollment not found" action={<ButtonLink href="/payments" variant="outline">All payments</ButtonLink>}>
            We couldn&apos;t find this enrollment on your account.
          </EmptyState>
        ) : (
          <ErrorState error={error} retry={refetch} />
        )}
      </AppPage>
    );
  }

  const p = e.payments[0] ?? e.latest_payment ?? null;
  const c = e.course;
  const amountDue = money(c.price, c.currency);
  const needsPayment = e.status === "pending_payment";
  const freshPayment = needsPayment && !p;
  const showPayFlow = e.can_submit_payment && (freshPayment || p?.status === "resubmit" || startNew);

  async function submitPayment(fd: FormData) {
    const updated = await api.post<EnrollmentDetail>(`/api/v1/enrollments/${enrollmentId}/payments`, fd);
    qc.setQueryData(keys.enrollment(enrollmentId), updated);
    void qc.invalidateQueries({ queryKey: keys.enrollments });
    void qc.invalidateQueries({ queryKey: keys.dashboard });
    setStartNew(false);
    toast("Receipt submitted for verification");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function viewReceipt(id: string) {
    setOpeningReceipt(true);
    try {
      await openSignedFile(`/api/v1/payments/${id}/receipt`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setOpeningReceipt(false);
    }
  }

  // ----- Approved
  if (e.status === "active") {
    return (
      <AppPage>
        <PageHeader title="Payment status" back={{ href: "/payments", label: "Payments" }} />
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-ok-soft text-ok">
              {c.is_free ? <PartyPopper className="size-8" aria-hidden /> : <CheckCircle2 className="size-8" aria-hidden />}
            </div>
            <Chip tone="ok">{c.is_free ? "Enrolled" : "Payment approved"}</Chip>
            <h2 className="text-xl">Welcome to {c.title}</h2>
            <p className="text-sm text-subtle">
              {e.expires_at ? (
                <>
                  Your access is active until <strong>{formatDate(e.expires_at)}</strong>.
                </>
              ) : (
                "You have lifetime access to this course."
              )}
            </p>
            <ButtonLink href={`/learn/${c.slug}`} size="lg" className="mt-2 w-full sm:w-auto">
              Start learning
            </ButtonLink>
          </Card>
          {!c.is_free && p && (
            <Card className="py-3">
              <Timeline steps={stepsFor(e, p)} />
            </Card>
          )}
        </div>
      </AppPage>
    );
  }

  // ----- Approval pending (free course, or approval-mode course)
  if (e.status === "pending_approval") {
    return (
      <AppPage>
        <PageHeader title="Enrollment" back={{ href: "/payments", label: "Payments" }} />
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-warn-soft text-warn">
            <Clock className="size-8" aria-hidden />
          </div>
          <h2 className="text-xl">Request sent</h2>
          <p className="max-w-sm text-sm text-subtle">
            An administrator will review your request for {c.title}. We&apos;ll email you with the decision.
          </p>
          <Chip tone="warn">Awaiting approval</Chip>
          <ButtonLink href="/courses" variant="outline" className="mt-2 w-full sm:w-auto">
            Back to courses
          </ButtonLink>
        </Card>
      </AppPage>
    );
  }

  // ----- Enrollment-level end states
  if (e.status === "rejected" || e.status === "revoked" || e.status === "expired") {
    const remark = [...e.timeline].reverse().find((t) => t.note)?.note ?? "";
    return (
      <AppPage>
        <PageHeader title="Enrollment" back={{ href: "/payments", label: "Payments" }} />
        <div className="flex flex-col gap-4">
          <Card className="flex items-center justify-between gap-3">
            <p className="font-heading font-bold">{c.title}</p>
            {statusChip(e, p)}
          </Card>
          <Banner
            tone={e.status === "expired" ? "info" : "bad"}
            title={
              e.status === "rejected"
                ? "Your enrollment request wasn't approved."
                : e.status === "revoked"
                  ? "Your access to this course was removed."
                  : "Your access to this course has ended."
            }
          >
            <Remark text={remark} />
          </Banner>
          <SupportLinks subject={`Enrollment: ${c.title}`} />
        </div>
      </AppPage>
    );
  }

  // ----- Pending payment: pay / pending / resubmit / rejected
  return (
    <AppPage wide={showPayFlow}>
      <PageHeader
        title={showPayFlow && !p ? `Pay for ${c.title}` : "Payment status"}
        back={{ href: "/payments", label: "Payments" }}
      />
      <div className="flex flex-col gap-4">
        {p && (
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-heading font-bold">{c.title}</p>
              {statusChip(e, p)}
            </div>
            <Timeline steps={stepsFor(e, p)} />
          </Card>
        )}

        {p?.status === "pending" && (
          <>
            <Banner tone="warn">Course content stays locked until an administrator approves your payment.</Banner>
            <Card className="py-1">
              <dl>
                {e.payment_reference && (
                  <div className="flex items-center justify-between gap-2 border-b border-line-soft py-2">
                    <dt className="text-sm text-muted">Reference</dt>
                    <dd className="flex items-center gap-1 font-mono text-sm font-bold">
                      {e.payment_reference}
                      <CopyButton value={e.payment_reference} label="Reference" />
                    </dd>
                  </div>
                )}
                <div className="flex min-h-14 items-center justify-between gap-2 py-2">
                  <dt className="text-sm text-muted">Amount</dt>
                  <dd className="flex items-center gap-3 text-sm font-medium">
                    {money(p.amount, p.currency)}
                    <Button size="sm" variant="ghost" loading={openingReceipt} onClick={() => viewReceipt(p.id)}>
                      View receipt
                    </Button>
                  </dd>
                </div>
              </dl>
            </Card>
            <SupportLinks subject={`Payment: ${c.title}`} />
          </>
        )}

        {p?.status === "resubmit" && (
          <Banner tone="warn" title="Please upload a clearer receipt.">
            <Remark text={p.remarks} />
          </Banner>
        )}

        {p?.status === "rejected" && !startNew && (
          <>
            <Banner tone="bad" title="We couldn't verify this payment.">
              <Remark text={p.remarks} />
              <p className="mt-1">If you believe this is a mistake, contact support with your bank statement, or submit a new payment.</p>
            </Banner>
            {e.can_submit_payment && (
              <Button size="lg" block className="md:w-auto md:self-start" onClick={() => setStartNew(true)}>
                Submit a new payment
              </Button>
            )}
            <SupportLinks subject={`Payment: ${c.title}`} />
          </>
        )}

        {needsPayment && !e.can_submit_payment && !p && (
          <Banner tone="info">Payment can&apos;t be submitted for this enrollment right now. Please contact support.</Banner>
        )}

        {showPayFlow && (
          <div className="grid gap-5 lg:grid-cols-2">
            <section aria-labelledby="pay-step-1" className="flex flex-col gap-3">
              <h2 id="pay-step-1" className="text-lg">
                <span className="text-muted">1 ·</span> Transfer the fee
              </h2>
              <Card className="flex flex-col gap-1">
                <p className="text-xs text-muted">Amount due</p>
                <p className="font-heading text-2xl font-bold text-ink">{amountDue}</p>
                <p className="text-xs text-muted">Pay the exact amount. Fees from your bank are not covered.</p>
              </Card>
              <h3 className="text-sm font-medium text-heading">Choose an account</h3>
              <BankDetails accounts={e.bank_accounts} reference={e.payment_reference} />
              {e.payment_reference && (
                <Banner tone="info">
                  Put the reference <strong className="font-mono">{e.payment_reference}</strong> in your transfer note so we can match it
                  quickly.
                </Banner>
              )}
              <Button
                variant="primary"
                size="lg"
                block
                className="lg:hidden"
                onClick={() => uploadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                I&apos;ve paid — upload receipt
              </Button>
            </section>
            <section ref={uploadRef} aria-labelledby="pay-step-2" className="flex scroll-mt-20 flex-col gap-3">
              <h2 id="pay-step-2" className="text-lg">
                <span className="text-muted">2 ·</span> {p ? "Upload a new receipt" : "Upload your receipt"}
              </h2>
              <Card>
                <ReceiptUploader maxMb={site.max_upload_mb} price={c.price} currency={c.currency} bankAccounts={e.bank_accounts} onSubmit={submitPayment} />
              </Card>
              <p className="text-xs text-muted">
                Your course unlocks as soon as an administrator approves the payment (usually within {e.review_eta}). You&apos;ll get an
                email.
              </p>
            </section>
          </div>
        )}

        {e.payments.length > 1 && (
          <section aria-labelledby="history" className="flex flex-col gap-2">
            <h2 id="history" className="text-base">
              Earlier submissions
            </h2>
            <Card className="py-1">
              <ul>
                {e.payments.slice(1).map((x) => (
                  <li key={x.id} className="flex min-h-12 items-center gap-3 border-b border-line-soft py-2 last:border-0">
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">{money(x.amount, x.currency)}</p>
                      <p className="text-xs text-muted">
                        <LocalDateTime iso={x.created_at} />
                      </p>
                    </div>
                    <Chip tone={x.status === "approved" ? "ok" : x.status === "pending" ? "warn" : "bad"}>
                      {x.status === "resubmit" ? "Resubmit requested" : x.status[0].toUpperCase() + x.status.slice(1)}
                    </Chip>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}
      </div>
    </AppPage>
  );
}
