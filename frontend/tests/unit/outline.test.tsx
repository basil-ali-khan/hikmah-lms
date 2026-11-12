import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CourseOutline } from "@/components/learn/outline";
import type { Outline, OutlineItem } from "@/lib/types";

const base = { required: true, order: 1, completed: false, locked: false, lock_reason: null } satisfies Partial<OutlineItem>;

const outline: Outline = {
  progress: { completed: 1, total: 3, percent: 33 },
  modules: [
    {
      id: 1,
      title: "Foundations",
      locked: false,
      release_at: null,
      completed_count: 2,
      items: [
        { ...base, type: "lesson", id: "l1", title: "Introduction", kind: "video", duration_minutes: 12, completed: true },
        { ...base, type: "quiz", id: "q1", title: "Quiz 1", best_percent: 80, passed: true, completed: true, order: 2 },
        { ...base, type: "lesson", id: "l2", title: "Second lesson", kind: "pdf", order: 3 },
        {
          ...base,
          type: "lesson",
          id: "l3",
          title: "Needs prerequisite",
          kind: "text",
          order: 4,
          locked: true,
          lock_reason: { code: "prerequisite", message: "Complete first.", lesson_id: "l2", title: "Second lesson" },
        },
        { ...base, type: "assignment", id: "a1", title: "Case study", order: 5, submission_status: "not_submitted", due_at: null },
      ],
    },
    {
      id: 2,
      title: "Later module",
      locked: true,
      release_at: "2030-12-01T09:00:00Z",
      completed_count: 0,
      items: [
        {
          ...base,
          type: "lesson",
          id: "l4",
          title: "Future lesson",
          kind: "video",
          locked: true,
          lock_reason: { code: "not_released", message: "Not available yet.", release_at: "2030-12-01T09:00:00Z" },
        },
        { ...base, type: "quiz", id: "q2", title: "Future quiz", locked: true, best_percent: null, passed: false },
      ],
    },
  ],
};

const linkTo = (href: string) => {
  const link = screen.getAllByRole("link").find((a) => a.getAttribute("href") === href);
  if (!link) throw new Error(`No link to ${href}`);
  return link;
};

describe("CourseOutline", () => {
  it("links lessons, quizzes and assignments to their pages", () => {
    render(<CourseOutline slug="tajweed" outline={outline} nextLessonId="l2" />);
    expect(screen.getByRole("link", { name: /Introduction/ })).toHaveAttribute("href", "/learn/tajweed/lessons/l1");
    expect(screen.getByRole("link", { name: /Quiz 1/ })).toHaveAttribute("href", "/learn/tajweed/quizzes/q1");
    expect(screen.getByRole("link", { name: /Case study/ })).toHaveAttribute("href", "/learn/tajweed/assignments/a1");
  });

  it("shows completed, up-next and passed states", () => {
    render(<CourseOutline slug="tajweed" outline={outline} nextLessonId="l2" />);
    const intro = screen.getByRole("link", { name: /Introduction/ });
    expect(intro).toHaveTextContent("Completed");
    expect(intro).toHaveTextContent("Video · 12 min");
    const quiz = screen.getByRole("link", { name: /Quiz 1/ });
    expect(within(quiz).getByText("Passed")).toBeInTheDocument();
    expect(quiz).toHaveTextContent("best 80%");
    const next = linkTo("/learn/tajweed/lessons/l2");
    expect(next).toHaveTextContent("Second lesson");
    expect(within(next).getByText("Up next")).toBeInTheDocument();
  });

  it("explains prerequisite locks but still links to the lesson", () => {
    render(<CourseOutline slug="tajweed" outline={outline} />);
    const locked = screen.getByRole("link", { name: /Needs prerequisite/ });
    expect(locked).toHaveAttribute("href", "/learn/tajweed/lessons/l3");
    expect(locked).toHaveTextContent("Locked");
    expect(locked).toHaveTextContent("Requires Second lesson");
  });

  it("does not link items in an unreleased module and shows when it opens", () => {
    render(<CourseOutline slug="tajweed" outline={outline} />);
    expect(screen.queryByRole("link", { name: /Future lesson/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Future quiz/ })).toBeNull();
    expect(screen.getByText("Future lesson")).toBeInTheDocument();
    const heading = screen.getByRole("heading", { name: /Later module/ });
    expect(heading).toHaveTextContent(/Opens/);
  });

  it("marks the open lesson as current in the compact variant", () => {
    render(<CourseOutline slug="tajweed" outline={outline} currentId="l2" variant="compact" />);
    expect(linkTo("/learn/tajweed/lessons/l2")).toHaveAttribute("aria-current", "page");
    expect(linkTo("/learn/tajweed/lessons/l3")).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /Introduction/ })).not.toHaveAttribute("aria-current");
  });
});
