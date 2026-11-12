import { Card, Chip, ProgressBar } from "@/components/ui";
import type { AttendanceSummary, Session } from "@/lib/types";

const attendanceChip = {
  present: { tone: "ok", label: "Attended" },
  late: { tone: "warn", label: "Late" },
  absent: { tone: "bad", label: "Missed" },
} as const;

/** The student's own attendance for one past session. Renders nothing when not yet marked. */
export function AttendanceChip({ status }: { status: Session["my_attendance"] }) {
  if (!status) return null;
  const c = attendanceChip[status];
  return <Chip tone={c.tone}>{c.label}</Chip>;
}

/** "Your attendance so far 4 of 5 · 80%" vs the course minimum needed for the certificate. */
export function AttendanceSummaryCard({
  attendance,
  minPercent,
}: {
  attendance: AttendanceSummary;
  minPercent: number | null;
}) {
  const met = minPercent !== null && attendance.percent !== null && attendance.percent >= minPercent;
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base">Your attendance so far</h2>
        <span className="text-sm font-medium text-ink">
          {attendance.total === 0
            ? "No classes yet"
            : `${attendance.attended} of ${attendance.total}${attendance.percent !== null ? ` · ${attendance.percent}%` : ""}`}
        </span>
      </div>
      {attendance.total > 0 && attendance.percent !== null && (
        <ProgressBar value={attendance.percent} tone={met ? "ok" : "primary"} label="Attendance" />
      )}
      {minPercent !== null && (
        <p className="text-xs text-muted">
          Needed for the certificate: {minPercent}%
          {attendance.total > 0 && (met ? " · on track" : "")}
        </p>
      )}
    </Card>
  );
}
