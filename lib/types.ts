export type Priority = "high" | "medium" | "low";
export type TaskStatus = "pending" | "in_progress" | "waiting_approval" | "completed";
export type UserRole = "admin" | "viewer";

export type Project = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  due_date: string | null;
  estimated_hours: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type TaskInput = {
  project_id: string;
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  due_date: string;
  estimated_hours: string;
};
