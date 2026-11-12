"use client";

import { ChevronRight, CreditCard } from "lucide-react";
import Link from "next/link";

import { AppPage } from "@/components/app-shell";
import { LocalDate } from "@/components/local-time";
import { ButtonLink, Chip, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { money } from "@/lib/format";
import { useMyEnrollments } from "@/lib/queries";
import type { Enrollment } from "@/lib/types";

function status(e: Enrollment): { label: string; tone: "ok" | "warn" | "bad" | "mute" | "primary" } {
  const p = e.latest_payment;
  if (e.status === "active") return { label: e.course.is_free ? "Enrolled" : "Approved", tone: "ok" };
  if (e.status === "pending_approval") return { label: "Awaiting approval", tone: "warn" };
  if (e.status === "rejected") return { label: "Rejected", tone: "bad" };
  if (e.status === "revoked") return { label: "Access removed", tone: "bad" };
  if (e.status === "expired") return { label: "Expired", tone: "mute" };
  if (p?.status === "pending") return { label: "Pending verification", tone: "warn" };
  if (p?.status === "resubmit") return { label: "Action needed", tone: "bad" };
  if (p?.status === "rejected") return { label: "Rejected", tone: "bad" };
  return { label: "Awaiting payment", tone: "primary" };
}

/** Paid courses (any state) and anything still waiting on payment or approval. */
function relevant(e: Enrollment) {
  return !e.course.is_free || e.status === "pending_approval" || e.status === "pending_payment" || !!e.latest_payment;
}

export default function PaymentsPage() {
  const { data, isLoading, error, refetch } = useMyEnrollments();
  const items = (data ?? []).filter(relevant);

  return (
    <AppPage>
      <PageHeader title="Payments" subtitle="Bank transfers and enrollment requests" />
      {isLoading && (
        <div className="flex flex-col gap-3" aria-label="Loading payments">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      )}
      {error && <ErrorState error={error} retry={refetch} />}
      {data && items.length === 0 && (
        <EmptyState
          icon={<CreditCard className="size-6" aria-hidden />}
          title="No payments yet"
          action={<ButtonLink href="/courses">Browse courses</ButtonLink>}
        >
          When you enroll in a paid course, its payment status shows up here.
        </EmptyState>
      )}
      {items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((e) => {
            const s = status(e);
            const p = e.latest_payment;
            return (
              <li key={e.id}>
                <Link
                  href={`/payments/${e.id}`}
                  className="flex min-h-16 items-center gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 hover:border-primary"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-heading font-bold">{e.course.title}</p>
                    <p className="truncate text-xs text-muted">
                      {e.course.is_free ? "Free" : money(p?.amount ?? e.course.price, p?.currency ?? e.course.currency)}
                      {" · "}
                      {p ? (
                        <>
                          submitted <LocalDate iso={p.created_at} />
                        </>
                      ) : (
                        <>
                          requested <LocalDate iso={e.created_at} />
                        </>
                      )}
                    </p>
                  </div>
                  <Chip tone={s.tone}>{s.label}</Chip>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AppPage>
  );
}
