import { supabase } from "@/lib/supabase";
import { priorityText, sortTasks, statusText } from "@/lib/helpers";
import type { Project, ProjectModule, Task } from "@/lib/types";

const PAGE_SIZE = 1000;

/** Fetches every matching row, not just the first Supabase default page. */
export async function fetchTasksForCsv(projectId?: string): Promise<Task[]> {
  const result: Task[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase.from("tasks").select("*");
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`CSV export failed: ${error.message}`);
    const page = (data ?? []) as Task[];
    result.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return result;
}

// Prevent spreadsheet apps from interpreting user-provided text as formulas.
function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function createTaskCsv(tasks: Task[], projects: Project[], modules: ProjectModule[] = []): string {
  const projectNameById = new Map(projects.map(project => [project.id, project.name]));
  const moduleById = new Map(modules.map(module => [module.id, module]));
  const lines: (string | number | null | undefined)[][] = [
    ["Project", "Task", "Role", "Module", "Priority", "Status", "Due Date", "Estimated Hours", "Notes", "Created At", "Updated At", "Completed At", "Task ID"],
  ];

  for (const task of sortTasks(tasks)) {
    lines.push([
      projectNameById.get(task.project_id) ?? "Unknown project",
      task.title,
      task.module_id ? moduleById.get(task.module_id)?.role ?? "" : "",
      task.module_id ? moduleById.get(task.module_id)?.name ?? "" : "",
      priorityText[task.priority],
      statusText[task.status],
      task.due_date,
      task.estimated_hours,
      task.description,
      task.created_at,
      task.updated_at,
      task.completed_at,
      task.id,
    ]);
  }

  // UTF-8 BOM lets Excel correctly open Hindi, accented characters and symbols.
  return `\uFEFF${lines.map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** The export contains all statuses, including approvals and completed tasks. */
export function downloadTaskCsv(tasks: Task[], projects: Project[], filename: string, modules: ProjectModule[] = []): void {
  const safeFilename = filename
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "") || "tasks.csv";
  const blob = new Blob([createTaskCsv(tasks, projects, modules)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
