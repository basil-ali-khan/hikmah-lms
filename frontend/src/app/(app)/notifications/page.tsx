"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import Link from "next/link";

import { AppPage } from "@/components/app-shell";
import { useToast } from "@/components/ui/toast";
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, cn } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { keys, useMarkAllRead, useNotifications } from "@/lib/queries";
import type { Notification } from "@/lib/types";

function isInternal(link: string) {
  return link.startsWith("/") && !link.startsWith("//");
}

export default function NotificationsPage() {
  const { data, isLoading, error, refetch } = useNotifications();
  const markAll = useMarkAllRead();
  const qc = useQueryClient();
  const toast = useToast();

  function markRead(n: Notification) {
    if (n.read) return;
    qc.setQueryData<{ unread_count: number; results: Notification[] }>(keys.notifications, (old) =>
      old
        ? { unread_count: Math.max(0, old.unread_count - 1), results: old.results.map((x) => (x.id === n.id ? { ...x, read: true } : x)) }
        : old,
    );
    api.post(`/api/v1/notifications/${n.id}/read`).catch(() => void qc.invalidateQueries({ queryKey: keys.notifications }));
  }

  const unread = data?.unread_count ?? 0;

  return (
    <AppPage>
      <PageHeader
        title="Notifications"
        actions={
          unread > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11"
              loading={markAll.isPending}
              onClick={() => markAll.mutate(undefined, { onError: (e) => toast(errorMessage(e), "error") })}
            >
              Mark all read
            </Button>
          ) : undefined
        }
      />
      {isLoading && (
        <div className="flex flex-col gap-2" aria-label="Loading notifications">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}
      {error && <ErrorState error={error} retry={refetch} />}
      {data && data.results.length === 0 && (
        <EmptyState icon={<Bell className="size-6" aria-hidden />} title="You're all caught up">
          Updates about your classes, payments and grades will appear here.
        </EmptyState>
      )}
      {data && data.results.length > 0 && (
        <Card className="p-0">
          <ul>
            {data.results.map((n) => {
              const body = (
                <>
                  <span
                    className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", n.read ? "text-subtle" : "font-bold text-ink")}>
                      {!n.read && <span className="sr-only">Unread: </span>}
                      {n.title}
                    </p>
                    {n.body && <p className="text-sm text-subtle">{n.body}</p>}
                    <p className="mt-0.5 text-xs text-muted">
                      <time dateTime={n.created_at} suppressHydrationWarning>
                        {relativeTime(n.created_at)}
                      </time>
                    </p>
                  </div>
                </>
              );
              const cls = cn("flex min-h-16 w-full gap-3 px-4 py-3 text-left", !n.read && "bg-primary-soft/60", n.link && "hover:bg-primary-soft");
              return (
                <li key={n.id} className="border-b border-line-soft last:border-0">
                  {n.link && isInternal(n.link) ? (
                    <Link href={n.link} className={cls} onClick={() => markRead(n)}>
                      {body}
                    </Link>
                  ) : n.link ? (
                    <a href={n.link} className={cls} onClick={() => markRead(n)} rel="noopener noreferrer">
                      {body}
                    </a>
                  ) : (
                    <button
                      type="button"
                      className={cls}
                      onClick={() => markRead(n)}
                    >
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </AppPage>
  );
}
