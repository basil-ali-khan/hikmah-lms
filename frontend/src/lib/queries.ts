"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, api } from "./api";
import type {
  AssignmentDetail,
  Attempt,
  AttemptResult,
  Certificate,
  CourseCard,
  CourseDetail,
  Dashboard,
  EnrollmentDetail,
  Enrollment,
  Grades,
  LearnCourse,
  Lesson,
  Me,
  Notification,
  ProfileField,
  QuizDetail,
  Session,
  AttendanceSummary,
} from "./types";

export const keys = {
  me: ["me"] as const,
  dashboard: ["dashboard"] as const,
  enrollments: ["enrollments"] as const,
  enrollment: (id: string) => ["enrollment", id] as const,
  course: (slug: string) => ["course", slug] as const,
  learn: (slug: string) => ["learn", slug] as const,
  lesson: (id: string) => ["lesson", id] as const,
  live: (slug: string) => ["live", slug] as const,
  session: (id: string) => ["session", id] as const,
  grades: (slug: string) => ["grades", slug] as const,
  quiz: (id: string) => ["quiz", id] as const,
  attempt: (id: string) => ["attempt", id] as const,
  result: (id: string) => ["result", id] as const,
  assignment: (id: string) => ["assignment", id] as const,
  certificates: ["certificates"] as const,
  notifications: ["notifications"] as const,
  schedule: ["schedule"] as const,
  profileFields: ["profile-fields"] as const,
};

/** The signed-in user, or null when signed out. */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api.get<Me>("/api/v1/me");
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
        throw e;
      }
    },
    staleTime: 30_000,
  });
}

export const useProfileFields = () =>
  useQuery({ queryKey: keys.profileFields, queryFn: () => api.get<ProfileField[]>("/api/v1/profile-fields"), staleTime: 300_000 });
export const useDashboard = () => useQuery({ queryKey: keys.dashboard, queryFn: () => api.get<Dashboard>("/api/v1/me/dashboard") });
export const useMyEnrollments = () =>
  useQuery({ queryKey: keys.enrollments, queryFn: () => api.get<Enrollment[]>("/api/v1/me/enrollments") });
export const useEnrollment = (id: string) =>
  useQuery({ queryKey: keys.enrollment(id), queryFn: () => api.get<EnrollmentDetail>(`/api/v1/enrollments/${id}`) });
export const useCourse = (slug: string) =>
  useQuery({ queryKey: keys.course(slug), queryFn: () => api.get<CourseDetail>(`/api/v1/courses/${slug}`) });
export const useCourses = (query = "") =>
  useQuery({ queryKey: ["courses", query], queryFn: () => api.get<CourseCard[]>(`/api/v1/courses${query ? `?${query}` : ""}`) });
export const useLearn = (slug: string) =>
  useQuery({ queryKey: keys.learn(slug), queryFn: () => api.get<LearnCourse>(`/api/v1/learn/${slug}`), retry: false });
export const useLesson = (id: string) =>
  useQuery({ queryKey: keys.lesson(id), queryFn: () => api.get<Lesson>(`/api/v1/lessons/${id}`), retry: false });
export const useCourseLive = (slug: string) =>
  useQuery({
    queryKey: keys.live(slug),
    queryFn: () =>
      api.get<{ upcoming: Session[]; past: Session[]; attendance: AttendanceSummary; min_attendance_percent: number | null }>(
        `/api/v1/learn/${slug}/live`,
      ),
    refetchInterval: 60_000,
  });
export const useSession = (id: string) =>
  useQuery({
    queryKey: keys.session(id),
    queryFn: () =>
      api.get<Session & { attendance: AttendanceSummary; min_attendance_percent: number | null }>(`/api/v1/live/${id}`),
    refetchInterval: 30_000,
  });
export const useGrades = (slug: string) =>
  useQuery({ queryKey: keys.grades(slug), queryFn: () => api.get<Grades>(`/api/v1/learn/${slug}/grades`) });
export const useQuiz = (id: string) =>
  useQuery({ queryKey: keys.quiz(id), queryFn: () => api.get<QuizDetail>(`/api/v1/quizzes/${id}`) });
export const useAttempt = (id: string) =>
  useQuery({ queryKey: keys.attempt(id), queryFn: () => api.get<Attempt>(`/api/v1/attempts/${id}`), refetchOnWindowFocus: true });
export const useAttemptResult = (id: string) =>
  useQuery({ queryKey: keys.result(id), queryFn: () => api.get<AttemptResult>(`/api/v1/attempts/${id}/result`) });
export const useAssignment = (id: string) =>
  useQuery({ queryKey: keys.assignment(id), queryFn: () => api.get<AssignmentDetail>(`/api/v1/assignments/${id}`) });
export const useCertificates = () =>
  useQuery({ queryKey: keys.certificates, queryFn: () => api.get<Certificate[]>("/api/v1/me/certificates") });
export const useSchedule = () => useQuery({ queryKey: keys.schedule, queryFn: () => api.get<Session[]>("/api/v1/me/schedule") });
export const useNotifications = (enabled = true) =>
  useQuery({
    queryKey: keys.notifications,
    queryFn: () => api.get<{ unread_count: number; results: Notification[] }>("/api/v1/notifications"),
    refetchInterval: 60_000,
    enabled,
  });

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/api/v1/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });
}
