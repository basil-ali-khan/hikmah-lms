"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { AppPage } from "@/components/app-shell";
import { FilePicker, checkFile, describeTypes } from "@/components/assess/file-picker";
import { LocalDateTime } from "@/components/local-time";
import { useToast } from "@/components/ui/toast";
import { Banner, Button, Card, Chip, EmptyState, ErrorState, Field, Html, PageHeader, Skeleton, Textarea } from "@/components/ui";
import { ApiError, api, errorMessage, openSignedFile } from "@/lib/api";
import { daysUntil } from "@/lib/format";
import { keys, useAssignment } from "@/lib/queries";
import type { AssignmentDetail, Submission } from "@/lib/types";

function DueChip({ a }: { a: AssignmentDetail }) {
  if (!a.due_at) return <Chip tone="mute">No deadline</Chip>;
  if (a.past_due) return <Chip tone="bad">Deadline passed</Chip>;
  const d = daysUntil(a.due_at);
  return <Chip tone={d <= 2 ? "warn" : "primary"}>{d <= 0 ? "Due today" : d === 1 ? "Due tomorrow" : `Due in ${d} days`}</Chip>;
}

function SubmissionForm({
  a,
  existing,
  onDone,
  onCancel,
}: {
  a: AssignmentDetail;
  existing: Submission;
  onDone: (s: NonNullable<Submission>) => void;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(existing?.text ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hint = `${describeTypes(a.allowed_types)} · max ${a.max_upload_mb} MB`;

  function select(f: File) {
    const err = checkFile(f, a.allowed_types, a.max_upload_mb);
    setFileError(err);
    setFile(err ? null : f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setErrors({});
    if (!text.trim() && !file && !existing?.file_name) {
      setFormError("Write an answer or attach a file.");
      return;
    }
    const fd = new FormData();
    fd.append("text", text);
    if (file) fd.append("file", file, file.name);
    setBusy(true);
    try {
      const sub = await api.post<NonNullable<Submission>>(`/api/v1/assignments/${a.id}/submit`, fd);
      onDone(sub);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors(err.fieldErrors);
        if (err.fieldErrors.file) setFileError(err.fieldErrors.file.join(" "));
      }
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Your answer" error={errors.text}>
        {(p) => <Textarea {...p} value={text} onChange={(e) => setText(e.target.value)} rows={8} maxLength={20000} />}
      </Field>
      <FilePicker
        label="Attach a file"
        hint={existing?.file_name && !file ? `${hint}. Leave empty to keep ${existing.file_name}.` : hint}
        accept={a.allowed_types.join(",")}
        file={file}
        onSelect={select}
        onClear={() => setFile(null)}
        error={fileError}
        disabled={busy}
      />
      {formError && (
        <p role="alert" className="text-sm font-medium text-bad">
          {formError}
        </p>
      )}
      <div className="flex flex-col gap-2 md:flex-row">
        <Button type="submit" size="lg" loading={busy} block className="md:w-auto">
          {existing ? "Resubmit assignment" : "Submit assignment"}
        </Button>
        {onCancel && (
          <Button type="button" variant="subtle" size="lg" onClick={onCancel} disabled={busy} block className="md:w-auto">
            Cancel
          </Button>
        )}
      </div>
      <p className="text-xs text-muted">
        You can resubmit until it&apos;s graded.{" "}
        {a.due_at && (a.allow_late ? "Late submissions are accepted and marked late." : "Late submissions aren't accepted.")}
      </p>
    </form>
  );
}

function SubmissionCard({ sub }: { sub: NonNullable<Submission> }) {
  const [opening, setOpening] = useState(false);
  const toast = useToast();
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base">Your submission</h2>
        {sub.status === "graded" ? (
          <Chip tone="ok">Graded</Chip>
        ) : sub.status === "resubmit" ? (
          <Chip tone="warn">Resubmission requested</Chip>
        ) : (
          <Chip tone="primary">Awaiting grade</Chip>
        )}
      </div>
      <p className="text-sm text-subtle">
        Submitted <LocalDateTime iso={sub.submitted_at} /> · {sub.is_late ? <span className="font-medium text-warn">late</span> : "on time"}
      </p>
      {sub.file_name && (
        <button
          type="button"
          className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-3 text-left hover:border-primary"
          onClick={async () => {
            setOpening(true);
            try {
              await openSignedFile(`/api/v1/submissions/${sub.id}/file`);
            } catch (e) {
              toast(errorMessage(e), "error");
            } finally {
              setOpening(false);
            }
          }}
          aria-busy={opening || undefined}
        >
          <FileText className="size-5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{sub.file_name}</span>
          <span className="text-sm font-medium text-primary">Open</span>
        </button>
      )}
      {sub.text && <p className="rounded-lg bg-[#F6F7F9] p-3 text-sm whitespace-pre-wrap text-ink">{sub.text}</p>}
    </Card>
  );
}

export default function AssignmentPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: a, isLoading, error, refetch } = useAssignment(id);
  const [editing, setEditing] = useState(false);
  const [openingBrief, setOpeningBrief] = useState(false);

  if (isLoading) {
    return (
      <AppPage>
        <div className="flex flex-col gap-3" aria-label="Loading assignment">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40" />
          <Skeleton className="h-48" />
        </div>
      </AppPage>
    );
  }
  if (error || !a) {
    const status = error instanceof ApiError ? error.status : 0;
    return (
      <AppPage>
        <PageHeader title="Assignment" back={{ href: `/learn/${slug}`, label: "Back to course" }} />
        {status === 403 || status === 404 ? (
          <EmptyState title={status === 404 ? "Assignment not found" : "You don't have access to this assignment"}>
            {errorMessage(error)}
          </EmptyState>
        ) : (
          <ErrorState error={error} retry={refetch} />
        )}
      </AppPage>
    );
  }

  const sub = a.submission;
  const showForm = a.can_submit && (!sub || sub.status === "resubmit" || editing);

  function onDone(s: NonNullable<Submission>) {
    qc.setQueryData<AssignmentDetail>(keys.assignment(id), (old) => (old ? { ...old, submission: s } : old));
    void qc.invalidateQueries({ queryKey: keys.assignment(id) });
    void qc.invalidateQueries({ queryKey: keys.learn(slug) });
    setEditing(false);
    toast("Assignment submitted");
  }

  return (
    <AppPage>
      <PageHeader title={a.title} back={{ href: `/learn/${slug}`, label: a.course.title }} />
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <DueChip a={a} />
          <Chip tone="mute">{a.max_score} marks</Chip>
          {a.due_at && (
            <span className="text-xs text-muted">
              Due <LocalDateTime iso={a.due_at} />
            </span>
          )}
        </div>

        {a.instructions_html && (
          <Card>
            <Html html={a.instructions_html} />
          </Card>
        )}

        {a.attachment && (
          <button
            type="button"
            className="flex min-h-14 items-center gap-3 rounded-[var(--radius-card)] border border-line bg-white px-4 text-left hover:border-primary"
            onClick={async () => {
              setOpeningBrief(true);
              try {
                await openSignedFile(`/api/v1/assignments/${a.id}/attachment`);
              } catch (e) {
                toast(errorMessage(e), "error");
              } finally {
                setOpeningBrief(false);
              }
            }}
            aria-busy={openingBrief || undefined}
          >
            <FileText className="size-5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.attachment.name}</span>
            <Download className="size-4 text-primary" aria-hidden />
            <span className="text-sm font-medium text-primary">Open</span>
          </button>
        )}

        {sub?.status === "graded" && (
          <Card className="flex flex-col gap-3 border-0 bg-ok-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-[#14532D]">Grade</p>
                <p className="font-heading text-2xl font-bold text-ink">
                  {sub.score} / {a.max_score}
                </p>
              </div>
              <Chip tone={sub.passed ? "ok" : "bad"} className="bg-white">
                {sub.passed ? "Passed" : "Not passed"}
              </Chip>
            </div>
            {sub.graded_at && (
              <p className="text-xs text-[#14532D]">
                Graded <LocalDateTime iso={sub.graded_at} /> · pass mark {a.pass_score}
              </p>
            )}
            {sub.feedback && (
              <div className="rounded-lg bg-white p-3">
                <p className="text-xs font-medium text-muted">Feedback</p>
                <p className="text-sm whitespace-pre-wrap text-ink">{sub.feedback}</p>
              </div>
            )}
          </Card>
        )}

        {sub?.status === "resubmit" && (
          <Banner tone="warn" title="Your instructor asked you to resubmit">
            {sub.feedback && <p className="whitespace-pre-wrap">“{sub.feedback}”</p>}
          </Banner>
        )}

        {sub && <SubmissionCard sub={sub} />}

        {!a.can_submit && !sub && a.past_due && (
          <Banner tone="bad" title="The deadline has passed">
            Late submissions aren&apos;t accepted for this assignment. Contact your instructor if you need help.
          </Banner>
        )}
        {a.can_submit && a.past_due && (
          <Banner tone="warn">The deadline has passed. You can still submit, but it will be marked late.</Banner>
        )}

        {showForm ? (
          <Card>
            <h2 className="mb-3 text-base">{sub ? "Submit again" : "Your answer"}</h2>
            <SubmissionForm a={a} existing={sub} onDone={onDone} onCancel={editing ? () => setEditing(false) : undefined} />
          </Card>
        ) : (
          sub &&
          sub.status === "submitted" &&
          a.can_submit && (
            <Button variant="outline" onClick={() => setEditing(true)} className="self-start">
              Edit and resubmit
            </Button>
          )
        )}
      </div>
    </AppPage>
  );
}
