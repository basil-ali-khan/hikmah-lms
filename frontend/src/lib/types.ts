// Shapes returned by the Django API (/api/v1). Kept explicit so the UI only relies on documented fields.

export type SiteConfig = {
  institute_name: string;
  tagline: string;
  description: string;
  logo_url: string | null;
  favicon_url: string | null;
  colors: { primary: string; accent: string; heading: string; text: string; surface: string };
  fonts: { heading: string; body: string };
  support: { email: string; whatsapp: string };
  social_links: Record<string, string>;
  institute_timezone: string;
  payment_review_eta: string;
  join_window_minutes: number;
  max_upload_mb: number;
  password_min_length: number;
  default_refund_policy: string;
  flags: {
    google_login: boolean;
    turnstile: boolean;
    pwa_install_prompt: boolean;
    analytics: boolean;
    self_service_deletion: boolean;
  };
  turnstile_site_key: string;
  footer_pages: { slug: string; title: string }[];
};

export type ProfileField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "phone" | "date" | "select" | "multiselect" | "country" | "number";
  required: boolean;
  options: string[];
  help_text: string;
  locked_after_save: boolean;
};

export type Me = {
  id: string;
  email: string;
  full_name: string;
  first_name: string;
  is_staff: boolean;
  staff_panel_url: string | null;
  email_verified: boolean;
  google_connected: boolean;
  profile: {
    data: Record<string, string | string[]>;
    timezone: string;
    class_reminders: boolean;
    deadline_reminders: boolean;
    privacy_consent_at: string | null;
  };
  profile_complete: boolean;
  missing_fields: string[];
  deletion_pending: boolean;
};

export type CourseType = "live" | "recorded" | "hybrid";

export type CourseCard = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  thumbnail_url: string | null;
  course_type: CourseType;
  category: { name: string; slug: string } | null;
  is_free: boolean;
  price: string;
  currency: string;
  starts_at: string | null;
  duration_label: string;
  schedule_label: string;
  featured: boolean;
  instructors: { name: string }[];
  access_type: "lifetime" | "days" | "until";
  access_days: number | null;
  access_until: string | null;
  capacity: number | null;
  seats_left: number | null;
  issue_certificate: boolean;
};

export type EnrollState =
  | "signed_out"
  | "email_unverified"
  | "profile_incomplete"
  | "not_eligible"
  | "enrollment_not_open"
  | "enrollment_closed"
  | "full"
  | "not_available"
  | "can_enroll"
  | "enrolled"
  | "pending_approval"
  | "pending_payment"
  | "expired"
  | "revoked"
  | "staff";

export type Video = {
  provider: "youtube" | "vimeo" | "bunny" | "file" | "link";
  video_id: string | null;
  embed_url: string | null;
  thumbnail_url: string | null;
  url?: string;
} | null;

export type CourseDetail = CourseCard & {
  description_html: string;
  outcomes_html: string;
  intro_video: Video;
  refund_policy: string;
  enrollment_mode: "instant" | "approval";
  enrollment_opens_at: string | null;
  enrollment_closes_at: string | null;
  ends_at: string | null;
  eligibility: string | null;
  modules: {
    title: string;
    release_at: string | null;
    lesson_count: number;
    quiz_count: number;
    assignment_count: number;
    lessons: { title: string; kind: string; duration_minutes: number | null }[];
  }[];
  upcoming_sessions: { title: string; starts_at: string; duration_minutes: number }[];
  completion: { lessons: boolean; quizzes: boolean; assignments: boolean; min_attendance_percent: number | null };
  enroll: { state: EnrollState; enrollment_id?: string; previously_rejected?: boolean };
};

export type Payment = {
  id: string;
  status: "pending" | "approved" | "rejected" | "resubmit";
  amount: string;
  currency: string;
  transaction_ref: string;
  paid_on: string | null;
  remarks: string;
  created_at: string;
  reviewed_at: string | null;
};

export type BankAccount = {
  id: number;
  display_name: string;
  currency: string;
  account_title: string;
  bank_name: string;
  account_number: string;
  swift_code: string;
  branch: string;
  instructions: string;
};

export type EnrollmentStatus = "pending_approval" | "pending_payment" | "active" | "rejected" | "revoked" | "expired";

export type Enrollment = {
  id: string;
  status: EnrollmentStatus;
  course: {
    slug: string;
    title: string;
    course_type: CourseType;
    is_free: boolean;
    price: string;
    currency: string;
    thumbnail_url: string | null;
  };
  activated_at: string | null;
  expires_at: string | null;
  completed_at: string | null;
  created_at: string;
  progress: Progress | null;
  latest_payment: Payment | null;
};

export type EnrollmentDetail = Enrollment & {
  payment_reference: string;
  bank_accounts: BankAccount[];
  payments: Payment[];
  review_eta: string;
  can_submit_payment: boolean;
  timeline: { action: string; to_status: string; at: string; note: string }[];
};

export type Progress = { completed: number; total: number; percent: number };

export type LockReason = {
  code: "not_found" | "not_enrolled" | "not_released" | "prerequisite" | "quiz_score";
  message: string;
  release_at?: string;
  lesson_id?: string;
  quiz_id?: string;
  title?: string;
  min_percent?: number;
} | null;

export type OutlineItem = {
  type: "lesson" | "quiz" | "assignment";
  id: string;
  title: string;
  kind?: "video" | "pdf" | "text" | "file";
  duration_minutes?: number | null;
  required: boolean;
  order: number;
  completed: boolean;
  locked: boolean;
  lock_reason: LockReason;
  best_percent?: number | null;
  passed?: boolean;
  closes_at?: string | null;
  due_at?: string | null;
  submission_status?: "not_submitted" | "submitted" | "graded" | "resubmit";
};

export type Outline = {
  modules: { id: number; title: string; locked: boolean; release_at: string | null; items: OutlineItem[]; completed_count: number }[];
  progress: Progress;
};

export type Requirement = { key: string; label: string; met: boolean; progress: string };
export type Completion = { complete: boolean; issues_certificate: boolean; requirements: Requirement[] };

export type LearnCourse = {
  course: { slug: string; title: string; course_type: CourseType; summary: string; schedule_label: string };
  enrollment: { status: EnrollmentStatus; expires_at: string | null; activated_at: string | null } | null;
  staff_preview: boolean;
  outline: Outline;
  next_lesson: { id: string; title: string } | null;
  completion: Completion;
  certificate: { code: string; valid: boolean } | null;
};

export type Lesson = {
  id: string;
  title: string;
  kind: "video" | "pdf" | "text" | "file";
  duration_minutes: number | null;
  module: { id: number; title: string };
  course: { slug: string; title: string };
  position: { index: number; total: number };
  previous_id: string | null;
  next_id: string | null;
  available: boolean;
  lock_reason: LockReason;
  completed: boolean;
  body_html?: string;
  video?: Video;
  file?: { name: string; size: number } | null;
};

export type Session = {
  id: string;
  title: string;
  description_html: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  platform: string;
  join_state: "upcoming" | "open" | "ended";
  course: { slug: string; title: string };
  recording: Video;
  recording_pending: boolean;
  my_attendance: "present" | "late" | "absent" | "" | null;
};

export type AttendanceSummary = { attended: number; total: number; percent: number | null };

export type QuizSummary = {
  attempts_used: number;
  attempts_left: number;
  best_percent: number | null;
  passed: boolean;
  needs_grading: boolean;
  in_progress_attempt: string | null;
};

export type QuizDetail = {
  id: string;
  title: string;
  instructions_html: string;
  course: { slug: string; title: string };
  question_count: number;
  time_limit_minutes: number | null;
  pass_percent: number;
  max_attempts: number;
  score_policy: "highest" | "latest";
  opens_at: string | null;
  closes_at: string | null;
  window: "open" | "not_open" | "closed";
  summary: QuizSummary;
  attempts: { id: string; number: number; status: string; started_at: string; submitted_at: string | null; percent: number | null; auto_submitted: boolean }[];
};

export type Attempt = {
  id: string;
  number: number;
  status: "in_progress" | "needs_grading" | "submitted";
  quiz: { id: string; title: string; course_slug: string };
  started_at: string;
  deadline_at: string | null;
  server_now: string;
  questions: {
    id: number;
    kind: "single" | "multi" | "short";
    text: string;
    points: number;
    choices: { id: number; text: string }[];
    answer: { choice_ids: number[]; text: string } | null;
  }[];
};

export type AttemptResult = {
  id: string;
  status: string;
  number: number;
  quiz: { id: string; title: string; course_slug: string; pass_percent: number };
  score: number | null;
  max_score: number | null;
  percent: number | null;
  passed: boolean;
  needs_grading: boolean;
  auto_submitted: boolean;
  duration_seconds: number | null;
  answers_visible: boolean;
  review: {
    question_id: number;
    text: string;
    kind: string;
    choices: { id: number; text: string; is_correct: boolean }[];
    your_choice_ids: number[];
    your_text: string;
    is_correct: boolean | null;
    points_awarded: number | null;
    points: number;
    feedback: string;
  }[];
};

export type Submission = {
  id: string;
  status: "submitted" | "graded" | "resubmit";
  text: string;
  file_name: string | null;
  submitted_at: string;
  is_late: boolean;
  score: number | null;
  feedback: string;
  graded_at: string | null;
  passed: boolean;
} | null;

export type AssignmentDetail = {
  id: string;
  title: string;
  instructions_html: string;
  course: { slug: string; title: string };
  due_at: string | null;
  allow_late: boolean;
  max_score: number;
  pass_score: number;
  attachment: { name: string } | null;
  past_due: boolean;
  can_submit: boolean;
  allowed_types: string[];
  max_upload_mb: number;
  submission: Submission;
};

export type Certificate = {
  code: string;
  course: { slug: string; title: string };
  student_name: string;
  completed_on: string;
  issued_at: string;
  valid: boolean;
  revoked_at: string | null;
};

export type VerifyResult = {
  status: "valid" | "revoked";
  code: string;
  student_name: string;
  course_title: string;
  completed_on: string;
  issued_by: string;
  revoked_at: string | null;
};

export type Notification = {
  id: number;
  event: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  created_at: string;
};

export type Dashboard = {
  next_session: Session | null;
  continue_learning: {
    course: { slug: string; title: string; course_type: CourseType; thumbnail_url: string | null };
    progress: Progress;
    expires_at: string | null;
    next_lesson: { id: string; title: string } | null;
  }[];
  due_soon: { type: "quiz" | "assignment"; id: string; title: string; due_at: string; course: { slug: string; title: string } }[];
  pending: { enrollment_id: string; status: EnrollmentStatus; course: { slug: string; title: string }; payment_status: Payment["status"] | null }[];
  certificates_count: number;
};

export type Grades = {
  completion: Completion;
  quizzes: (QuizSummary & { id: string; title: string; pass_percent: number; required: boolean })[];
  assignments: { id: string; title: string; required: boolean; max_score: string; pass_score: string; status: string; passed: boolean; score: string | null }[];
  attendance: AttendanceSummary;
};
