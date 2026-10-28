import type { Priority, Task, TaskStatus } from "./types";

export const PRIORITIES: Priority[] = ["high", "medium", "low"];
export const STATUSES: TaskStatus[] = ["pending", "in_progress", "waiting_approval", "completed"];

export const priorityText: Record<Priority, string> = {
  high: "High priority", medium: "Medium priority", low: "Low priority"
};
export const statusText: Record<TaskStatus, string> = {
  pending: "Pending", in_progress: "In progress", waiting_approval: "Waiting for approval", completed: "Completed"
};

export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function readableDate(value: string): string {
  // Treat SQL DATE as calendar date, not UTC timestamp.
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function sortTasks(tasks: Task[]): Task[] {
  const rank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  const progressRank: Record<TaskStatus, number> = {
    in_progress: 0, pending: 1, waiting_approval: 2, completed: 3
  };
  return [...tasks].sort((a, b) =>
    rank[a.priority] - rank[b.priority] ||
    progressRank[a.status] - progressRank[b.status] ||
    (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31") ||
    a.title.localeCompare(b.title)
  );
}
