"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  AlertCircle, ArrowRight, CalendarDays, Check, CheckCircle2, Clock3, Folder,
  FolderPlus, LayoutDashboard, ListTodo, Loader2, LogOut, Menu, MoreHorizontal,
  Pencil, Plus, Search, ShieldCheck, Trash2, X, Download, ChevronDown, ChevronLeft, ChevronRight, Mic,
} from "lucide-react";
import { isConfigured, supabase } from "@/lib/supabase";
import VoiceAssistant from "@/components/voice-assistant";
import ModuleOverview from "@/components/module-overview";
import { downloadTaskCsv, fetchTasksForCsv } from "@/lib/export-csv";
import type { Priority, Project, ProjectModule, Task, TaskInput, TaskStatus, UserRole } from "@/lib/types";
import { localDateKey, priorityText, PRIORITIES, readableDate, sortTasks, STATUSES, statusText } from "@/lib/helpers";

type TabId = "all" | string;
type LoadError = string | null;

const defaultTask = (projectId: string, moduleId = ""): TaskInput => ({
  project_id: projectId,
  module_id: moduleId,
  title: "",
  description: "",
  priority: "medium",
  status: "pending",
  due_date: "",
  estimated_hours: "",
});

function SetupRequired() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-mark"><ListTodo size={23} /></div>
        <h1>Connect your database</h1>
        <p>Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> in <code>.env.local</code>, then restart the development server.</p>
        <p className="muted">See README.md for the full Supabase and deployment setup.</p>
      </div>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) setError(authError.message);
    setBusy(false);
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-mark"><ListTodo size={23} /></div>
        <div className="eyebrow">WORKSPACE ACCESS</div>
        <h1>Welcome back.</h1>
        <p>Sign in to manage projects, priorities and daily work from one place.</p>
        <form onSubmit={submit} className="form-stack">
          <label className="field-label">Email address
            <input className="input" type="email" autoComplete="email" required placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="field-label">Password
            <input className="input" type="password" autoComplete="current-password" required placeholder="Enter password" value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          {error && <div role="alert" className="alert error-alert"><AlertCircle size={16} />{error}</div>}
          <button type="submit" className="btn btn-dark btn-full" disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <ArrowRight size={16} />} Sign in
          </button>
        </form>
        <div className="auth-footer"><ShieldCheck size={15} /> Private workspace · Invite-only access</div>
      </div>
    </div>
  );
}

function Modal({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="modal">
        <div className="modal-top"><div><div className="eyebrow">WORKSPACE</div><h2>{title}</h2></div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><X size={19} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TaskDialog({ initial, projects, modules, preferredModuleId, onClose, onSave, onDelete }: {
  initial: Task | null;
  projects: Project[];
  modules: ProjectModule[];
  preferredModuleId?: string;
  onClose: () => void;
  onSave: (input: TaskInput, existing: Task | null) => Promise<string | null>;
  onDelete: (task: Task) => Promise<string | null>;
}) {
  const [form, setForm] = useState<TaskInput>(() => initial ? {
    project_id: initial.project_id,
    module_id: initial.module_id ?? "",
    title: initial.title,
    description: initial.description ?? "",
    priority: initial.priority,
    status: initial.status,
    due_date: initial.due_date ?? "",
    estimated_hours: initial.estimated_hours?.toString() ?? "",
  } : defaultTask(projects[0]?.id ?? "", preferredModuleId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => setForm(prev => ({ ...prev, [key]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim() || !form.project_id) return;
    setBusy(true); setError("");
    const message = await onSave(form, initial);
    if (message) { setError(message); setBusy(false); } else onClose();
  }
  async function remove() {
    if (!initial || !window.confirm("Delete this task permanently?")) return;
    setBusy(true); setError("");
    const message = await onDelete(initial);
    if (message) { setError(message); setBusy(false); } else onClose();
  }

  return (
    <Modal title={initial ? "Edit task" : "Create task"} onClose={onClose}>
      <form onSubmit={submit} className="form-stack">
        <label className="field-label">Task title *
          <input className="input" required maxLength={200} autoFocus placeholder="What needs to be done?" value={form.title} onChange={e => set("title", e.target.value)} />
        </label>
        <label className="field-label">Project *
          <select className="input" value={form.project_id} required onChange={e => setForm(previous => ({ ...previous, project_id: e.target.value, module_id: "" }))}>
            {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        {modules.some(module => module.project_id === form.project_id) &&
          <label className="field-label">Module (optional)
            <select className="input" value={form.module_id} onChange={e => set("module_id", e.target.value)}>
              <option value="">Unassigned to a module</option>
              {modules.filter(module => module.project_id === form.project_id)
                .sort((a, b) => a.role.localeCompare(b.role) || a.sort_order - b.sort_order)
                .map(module => <option key={module.id} value={module.id}>
                  {module.role.charAt(0).toUpperCase() + module.role.slice(1)} / {module.name}
                </option>)}
            </select>
          </label>}
        <div className="form-grid">
          <label className="field-label">Priority
            <select className="input" value={form.priority} onChange={e => set("priority", e.target.value as Priority)}>
              {PRIORITIES.map(value => <option key={value} value={value}>{priorityText[value]}</option>)}
            </select>
          </label>
          <label className="field-label">Status
            <select className="input" value={form.status} onChange={e => set("status", e.target.value as TaskStatus)}>
              {STATUSES.map(value => <option key={value} value={value}>{statusText[value]}</option>)}
            </select>
          </label>
          <label className="field-label">Due date
            <input className="input" type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)} />
          </label>
          <label className="field-label">Estimated hours
            <input className="input" type="number" inputMode="decimal" min="0" max="9999.99" step="0.25" placeholder="Optional" value={form.estimated_hours} onChange={e => set("estimated_hours", e.target.value)} />
          </label>
        </div>
        <label className="field-label">Notes
          <textarea className="input textarea" rows={3} placeholder="Links, dependencies or instructions..." value={form.description} onChange={e => set("description", e.target.value)} />
        </label>
        {error && <div role="alert" className="alert error-alert"><AlertCircle size={16} />{error}</div>}
        <div className="modal-actions">
          {initial && <button type="button" onClick={remove} disabled={busy} className="btn btn-danger"><Trash2 size={15} /> Delete</button>}
          <div className="push-right" />
          <button type="button" className="btn btn-light" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-dark" disabled={busy}>{busy ? <Loader2 className="spin" size={16} /> : <Check size={16} />}{initial ? "Save changes" : "Create task"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ProjectDialog({ initial, onClose, onSave, onDelete }: {
  initial: Project | null;
  onClose: () => void;
  onSave: (input: { name: string; description: string; priority: Priority }, existing: Project | null) => Promise<string | null>;
  onDelete: (project: Project) => Promise<string | null>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const message = await onSave({ name: name.trim(), description: description.trim(), priority }, initial);
    if (message) { setError(message); setBusy(false); } else onClose();
  }
  async function remove() {
    if (!initial || !window.confirm(`Delete "${initial.name}" and ALL of its tasks? This cannot be undone.`)) return;
    setBusy(true); setError("");
    const message = await onDelete(initial);
    if (message) { setError(message); setBusy(false); } else onClose();
  }
  return (
    <Modal title={initial ? "Edit project" : "New project"} onClose={onClose}>
      <form onSubmit={submit} className="form-stack">
        <label className="field-label">Project name *
          <input className="input" required maxLength={100} autoFocus placeholder="e.g. Company Website" value={name} onChange={e => setName(e.target.value)} />
        </label>
        <label className="field-label">Description
          <textarea className="input textarea" rows={3} placeholder="Optional project details" value={description} onChange={e => setDescription(e.target.value)} />
        </label>
        <label className="field-label">Project priority
          <select className="input" value={priority} onChange={e => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map(value => <option key={value} value={value}>{priorityText[value]}</option>)}
          </select>
        </label>
        {error && <div role="alert" className="alert error-alert"><AlertCircle size={16} />{error}</div>}
        <div className="modal-actions">
          {initial && <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}><Trash2 size={15} /> Delete project</button>}
          <div className="push-right" />
          <button type="button" className="btn btn-light" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-dark" disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />}{initial ? "Save project" : "Add project"}</button>
        </div>
      </form>
    </Modal>
  );
}

function TaskCard({ task, projectName, moduleName, editable, onEdit, onStatusChange, compact = false }: {
  task: Task;
  projectName: string;
  moduleName?: string;
  editable: boolean;
  onEdit: (task: Task) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  compact?: boolean;
}) {
  const overdue = task.due_date && task.due_date < localDateKey() && task.status !== "completed";
  return (
    <article className={`task-card ${compact ? "task-compact" : ""}`}>
      <div className="task-card-top">
        <div className="task-title-area">
          <span className={`priority-dot ${task.priority}`} title={priorityText[task.priority]} />
          <h3>{task.title}</h3>
        </div>
        {editable && <button className="icon-btn task-menu" aria-label={`Edit ${task.title}`} title="Edit task" onClick={() => onEdit(task)}><Pencil size={15} /></button>}
      </div>
      {!compact && task.description && <p className="task-description">{task.description}</p>}
      <div className="task-meta">
        <span className="project-chip"><Folder size={13} />{projectName}</span>
        {moduleName && <span className="module-task-tag">{moduleName}</span>}
        <span className={`status-tag status-${task.status}`}>{statusText[task.status]}</span>
        {task.due_date && <span className={`date-chip ${overdue ? "overdue" : ""}`}><CalendarDays size={13} />{readableDate(task.due_date)}{overdue ? " · Overdue" : ""}</span>}
        {task.estimated_hours !== null && !compact && <span className="date-chip"><Clock3 size={13} />{task.estimated_hours}h</span>}
      </div>
      {editable && !compact && (
        <div className="task-bottom">
          <span className={`priority-label ${task.priority}`}>{priorityText[task.priority]}</span>
          <label className="sr-only" htmlFor={`status-${task.id}`}>Change task status</label>
          <select id={`status-${task.id}`} className="status-picker" title="Change status" value={task.status} onChange={event => onStatusChange(task, event.target.value as TaskStatus)}>
            {STATUSES.map(status => <option key={status} value={status}>{statusText[status]}</option>)}
          </select>
        </div>
      )}
    </article>
  );
}

function EmptyBox({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-box"><div className="empty-icon"><ListTodo size={20} /></div><strong>{title}</strong><p>{detail}</p></div>;
}

// Pagination is strictly a presentation concern: all tasks remain loaded for counts,
// search, realtime updates and CSV export. Keep the LMS project board untouched.
const ACTIVE_PAGE_SIZE = 4;
const SIDE_PAGE_SIZE = 3;

function BoardPagination({ label, page, total, pageSize, onChange }: {
  label: string;
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <nav className="board-pagination" aria-label={`${label} pagination`}>
      <span className="pagination-summary">Showing {start}–{end} of {total}</span>
      <div className="pagination-controls">
        <button type="button" className="pagination-button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label={`Previous ${label} page`}>
          <ChevronLeft size={15} /> <span>Prev</span>
        </button>
        <span className="pagination-current" aria-live="polite">{page} / {totalPages}</span>
        <button type="button" className="pagination-button" onClick={() => onChange(page + 1)} disabled={page >= totalPages} aria-label={`Next ${label} page`}>
          <span>Next</span> <ChevronRight size={15} />
        </button>
      </div>
    </nav>
  );
}

export default function TrackerApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [modules, setModules] = useState<ProjectModule[]>([]);
  const [loadError, setLoadError] = useState<LoadError>(null);
  const [busyLoading, setBusyLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [search, setSearch] = useState("");
  const [activePage, setActivePage] = useState(1);
  const [approvalPage, setApprovalPage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; task: Task | null; moduleId?: string }>({ open: false, task: null });
  const [projectDialog, setProjectDialog] = useState<{ open: boolean; project: Project | null }>({ open: false, project: null });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const editable = role === "admin";

  useEffect(() => {
    if (!exportOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) setExportOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExportOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [exportOpen]);

  useEffect(() => {
    if (!isConfigured) { setAuthLoading(false); return; }
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setLoadError(error.message);
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setAuthLoading(false);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const refresh = useCallback(async () => {
    const [projectResponse, taskResponse, moduleResponse] = await Promise.all([
      supabase.from("projects").select("*").order("name"),
      supabase.from("tasks").select("*"),
      supabase.from("project_modules").select("*").order("sort_order"),
    ]);
    if (projectResponse.error || taskResponse.error || moduleResponse.error) {
      setLoadError(projectResponse.error?.message ?? taskResponse.error?.message ?? moduleResponse.error?.message ?? "Unable to load data");
    } else {
      setProjects((projectResponse.data ?? []) as Project[]);
      setTasks((taskResponse.data ?? []) as Task[]);
      setModules((moduleResponse.data ?? []) as ProjectModule[]);
      setLoadError(null);
    }
    setBusyLoading(false);
  }, []);

  useEffect(() => {
    if (!session?.user.id) {
      setRole(null); setRoleLoading(false); setBusyLoading(false); setProjects([]); setTasks([]); setModules([]);
      return;
    }
    let active = true;
    setRoleLoading(true);
    setBusyLoading(true);
    void (async () => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id).maybeSingle();
      if (!active) return;
      if (error) setLoadError(error.message);
      const nextRole: UserRole | null = data?.role === "admin" || data?.role === "viewer" ? data.role : null;
      setRole(nextRole);
      setRoleLoading(false);
      if (nextRole) await refresh();
      else setBusyLoading(false);
    })();
    return () => { active = false; };
  }, [session?.user.id, refresh]);

  useEffect(() => {
    if (!session?.user.id || !role) return;
    const channel = supabase.channel(`tracker-sync-${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => { void refresh(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => { void refresh(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "project_modules" }, () => { void refresh(); })
      .subscribe();
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("focus", onFocus); void supabase.removeChannel(channel); };
  }, [session?.user.id, role, refresh]);

  // The LMS backlog is intentionally kept separate from client delivery work.
  const lmsProject = useMemo(() => projects.find(project => project.name.trim().toLowerCase() === "lms"), [projects]);
  const isMaster = activeTab === "all";
  const isLmsPage = Boolean(lmsProject && activeTab === lmsProject.id);
  const projectTaskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) counts.set(task.project_id, (counts.get(task.project_id) ?? 0) + 1);
    return counts;
  }, [tasks]);
  const sortedClientProjects = useMemo(() => projects
    .filter(project => project.id !== lmsProject?.id)
    .sort((a, b) => {
      // Projects with at least one task first; empty projects last.
      const aHasTasks = (projectTaskCounts.get(a.id) ?? 0) > 0;
      const bHasTasks = (projectTaskCounts.get(b.id) ?? 0) > 0;
      if (aHasTasks !== bHasTasks) return aHasTasks ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }), [projects, lmsProject?.id, projectTaskCounts]);
  const lmsTasks = useMemo(() => tasks.filter(task => task.project_id === lmsProject?.id), [tasks, lmsProject?.id]);
  const lmsActiveTasks = useMemo(() => sortTasks(lmsTasks.filter(task => task.status === "pending" || task.status === "in_progress")), [lmsTasks]);
  const lmsWaitingCount = lmsTasks.filter(task => task.status === "waiting_approval").length;
  const lmsCompletedCount = lmsTasks.filter(task => task.status === "completed").length;
  const clientTaskCount = tasks.length - lmsTasks.length;

  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p.name])), [projects]);
  const moduleMap = useMemo(() => new Map(modules.map(module => [module.id,
    `${module.role.charAt(0).toUpperCase() + module.role.slice(1)} / ${module.name}`])), [modules]);
  const visibleTasks = useMemo(() => tasks.filter(task => {
    if (isMaster && lmsProject && task.project_id === lmsProject.id) return false;
    if (!isMaster && task.project_id !== activeTab) return false;
    if (!search.trim()) return true;
    const query = search.toLowerCase().trim();
    return `${task.title} ${task.description ?? ""} ${projectMap.get(task.project_id) ?? ""} ${task.module_id ? moduleMap.get(task.module_id) ?? "" : ""}`.toLowerCase().includes(query);
  }), [tasks, activeTab, isMaster, lmsProject, search, projectMap, moduleMap]);
  const activeTasks = useMemo(() => sortTasks(visibleTasks.filter(task => task.status === "pending" || task.status === "in_progress")), [visibleTasks]);
  const approvalTasks = useMemo(() => sortTasks(visibleTasks.filter(task => task.status === "waiting_approval")), [visibleTasks]);
  const completedTasks = useMemo(() => [...visibleTasks.filter(task => task.status === "completed")]
    .sort((a, b) => (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at)), [visibleTasks]);
  // The normal client-task panels are paginated; LMS project view keeps its
  // existing full module/task board and the Master LMS preview remains unchanged.
  const paginateClientBoard = !isLmsPage;
  const activePageCount = Math.max(1, Math.ceil(activeTasks.length / ACTIVE_PAGE_SIZE));
  const approvalPageCount = Math.max(1, Math.ceil(approvalTasks.length / SIDE_PAGE_SIZE));
  const completedPageCount = Math.max(1, Math.ceil(completedTasks.length / SIDE_PAGE_SIZE));
  const currentActivePage = Math.min(activePage, activePageCount);
  const currentApprovalPage = Math.min(approvalPage, approvalPageCount);
  const currentCompletedPage = Math.min(completedPage, completedPageCount);
  const shownActiveTasks = paginateClientBoard
    ? activeTasks.slice((currentActivePage - 1) * ACTIVE_PAGE_SIZE, currentActivePage * ACTIVE_PAGE_SIZE)
    : activeTasks;
  const shownApprovalTasks = paginateClientBoard
    ? approvalTasks.slice((currentApprovalPage - 1) * SIDE_PAGE_SIZE, currentApprovalPage * SIDE_PAGE_SIZE)
    : approvalTasks;
  const shownCompletedTasks = paginateClientBoard
    ? completedTasks.slice((currentCompletedPage - 1) * SIDE_PAGE_SIZE, currentCompletedPage * SIDE_PAGE_SIZE)
    : completedTasks;

  // Start from page 1 after changing project or searching. When realtime
  // updates reduce a list, clamp its page instead of showing an empty panel.
  useEffect(() => {
    setActivePage(1);
    setApprovalPage(1);
    setCompletedPage(1);
  }, [activeTab, search]);
  useEffect(() => { setActivePage(p => Math.min(p, activePageCount)); }, [activePageCount]);
  useEffect(() => { setApprovalPage(p => Math.min(p, approvalPageCount)); }, [approvalPageCount]);
  useEffect(() => { setCompletedPage(p => Math.min(p, completedPageCount)); }, [completedPageCount]);

  const selectedProject = projects.find(p => p.id === activeTab);
  const scopedTasks = isMaster
    ? tasks.filter(task => task.project_id !== lmsProject?.id)
    : tasks.filter(task => task.project_id === activeTab);
  const taskCount = scopedTasks.filter(t => t.status === "pending" || t.status === "in_progress").length;
  const dueToday = scopedTasks.filter(t => t.due_date === localDateKey() && t.status !== "completed").length;
  const overdueCount = scopedTasks.filter(t => t.due_date && t.due_date < localDateKey() && t.status !== "completed").length;

  async function saveTask(input: TaskInput, initial: Task | null): Promise<string | null> {
    if (!editable) return "Only admins can edit tasks.";
    const trimmed = input.title.trim();
    if (!trimmed || !input.project_id) return "Please enter a title and select a project.";
    const hours = input.estimated_hours.trim() ? Number(input.estimated_hours) : null;
    if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 9999.99)) return "Estimated hours must be between 0 and 9999.99.";
    if (input.module_id && !modules.some(module => module.id === input.module_id && module.project_id === input.project_id)) {
      return "Selected module does not belong to this project.";
    }
    const payload = {
      project_id: input.project_id,
      module_id: input.module_id || null,
      title: trimmed,
      description: input.description.trim() || null,
      priority: input.priority,
      status: input.status,
      due_date: input.due_date || null,
      estimated_hours: hours,
      completed_at: input.status === "completed" ? (initial?.completed_at ?? new Date().toISOString()) : null,
    };
    const { error } = initial
      ? await supabase.from("tasks").update(payload).eq("id", initial.id)
      : await supabase.from("tasks").insert(payload);
    if (error) return error.message;
    await refresh();
    return null;
  }

  async function deleteTask(task: Task): Promise<string | null> {
    if (!editable) return "Only admins can delete tasks.";
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) return error.message;
    await refresh();
    return null;
  }

  async function setStatus(task: Task, status: TaskStatus) {
    if (!editable || task.status === status) return;
    const { error } = await supabase.from("tasks").update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    }).eq("id", task.id);
    if (error) setLoadError(error.message);
    else await refresh();
  }

  async function saveProject(input: { name: string; description: string; priority: Priority }, initial: Project | null): Promise<string | null> {
    if (!editable) return "Only admins can edit projects.";
    if (!input.name) return "Project name is required.";
    const payload = { name: input.name, description: input.description || null, priority: input.priority };
    const { error } = initial
      ? await supabase.from("projects").update(payload).eq("id", initial.id)
      : await supabase.from("projects").insert(payload);
    if (error) return error.message;
    await refresh();
    return null;
  }

  async function deleteProject(project: Project): Promise<string | null> {
    if (!editable) return "Only admins can delete projects.";
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    if (error) return error.message;
    if (activeTab === project.id) setActiveTab("all");
    await refresh();
    return null;
  }

  const openNewTask = () => {
    if (!projects.length) { setProjectDialog({ open: true, project: null }); return; }
    setTaskDialog({ open: true, task: null });
  };

  async function exportCsv(project: Project | null, scope: "all" | "clients" = "all") {
    if (exporting) return;
    setExportOpen(false);
    setExportError(null);
    setExporting(true);
    try {
      // Fetch directly from Supabase so exports include every status and task,
      // including records not present in the currently visible/search-filtered board.
      const exportRows = await fetchTasksForCsv(project?.id);
      const rows = scope === "clients" && lmsProject
        ? exportRows.filter(task => task.project_id !== lmsProject.id)
        : exportRows;
      const filename = project
        ? `${project.name}-tasks-${localDateKey()}.csv`
        : scope === "clients" ? `client-projects-tasks-${localDateKey()}.csv` : `all-projects-tasks-${localDateKey()}.csv`;
      downloadTaskCsv(rows, projects, filename, modules);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Unable to export tasks. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  if (!isConfigured) return <SetupRequired />;
  if (authLoading || (session && roleLoading)) return <div className="loading-page"><Loader2 className="spin" size={28} /><span>Loading workspace...</span></div>;
  if (!session) return <SignIn />;
  if (!role) return (
    <div className="auth-page"><div className="auth-card"><div className="auth-mark"><ShieldCheck size={22} /></div>
      <h1>Access not granted</h1><p>Your account exists, but a workspace admin must add it to <strong>user_roles</strong> before you can view projects.</p>
      <button className="btn btn-dark btn-full" onClick={() => void supabase.auth.signOut()}>Sign out</button>
    </div></div>
  );

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="mobile-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand"><div className="brand-logo"><ListTodo size={21} /></div><div><strong>Workboard</strong><span>Project management</span></div></div>
        <div className="nav-group">
          <div className="nav-label">WORKSPACE</div>
          <button onClick={() => { setActiveTab("all"); setSearch(""); setSidebarOpen(false); }} className={`nav-item ${activeTab === "all" ? "nav-active" : ""}`}>
            <LayoutDashboard size={17} /><span>Master dashboard</span><span className="nav-count">{clientTaskCount}</span>
          </button>
          {lmsProject && <button onClick={() => { setActiveTab(lmsProject.id); setSearch(""); setSidebarOpen(false); }} className={`nav-item ${isLmsPage ? "nav-active" : ""}`}>
            <ListTodo size={17} /><span>LMS</span><span className="nav-count">{lmsTasks.length}</span>
          </button>}
        </div>
        <div className="nav-group nav-projects">
          <div className="nav-heading"><span className="nav-label">YOUR PROJECTS</span>
            {editable && <button title="Add project" aria-label="Add project" className="tiny-icon" onClick={() => setProjectDialog({ open: true, project: null })}><Plus size={16} /></button>}
          </div>
          {sortedClientProjects.map(project => (
            <button key={project.id} onClick={() => { setActiveTab(project.id); setSearch(""); setSidebarOpen(false); }} className={`nav-item ${activeTab === project.id ? "nav-active" : ""}`}>
              <Folder size={17} /><span className="ellipsis">{project.name}</span><span className="nav-count">{projectTaskCounts.get(project.id) ?? 0}</span>
            </button>
          ))}
          {!sortedClientProjects.length && <p className="sidebar-empty">No client projects yet.</p>}
          {editable && <button className="nav-item add-project-link" onClick={() => setProjectDialog({ open: true, project: null })}><FolderPlus size={17} /><span>Add project</span></button>}
        </div>
        <div className="sidebar-bottom"><div className="identity-avatar">{(session.user.email ?? "U").charAt(0).toUpperCase()}</div>
          <div className="identity-text"><strong>{role === "admin" ? "Administrator" : "Viewer"}</strong><span title={session.user.email}>{session.user.email}</span></div>
          <button className="icon-btn logout-btn" aria-label="Sign out" title="Sign out" onClick={() => void supabase.auth.signOut()}><LogOut size={17} /></button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar"><div className="topbar-left">
          <button className="mobile-menu icon-btn" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <span>Workspace</span><span className="slash">/</span><strong>{selectedProject?.name ?? "Overview"}</strong>
        </div><div className="topbar-right"><span className="secure-note"><ShieldCheck size={15} /> Private workspace</span>
          <span className="user-role">{role === "admin" ? "Admin" : "Read only"}</span></div></header>

        <div className="content">
          <div className="page-intro"><div>
            <div className="eyebrow">{activeTab === "all" ? "CLIENT PROJECTS + LMS" : "PROJECT OVERVIEW"}</div>
            <h1>{selectedProject?.name ?? "Master Dashboard"}</h1>
            <p>{selectedProject?.description || (activeTab === "all" ? "Client project tasks and LMS development tracked separately." : "Keep track of everything that needs to get done.")}</p>
          </div><div className="page-actions">
            {editable && <button className="btn btn-light" onClick={() => setProjectDialog({ open: true, project: null })}><FolderPlus size={16} /> Add project</button>}
            {editable && selectedProject && <button className="btn btn-light" onClick={() => setProjectDialog({ open: true, project: selectedProject })}><MoreHorizontal size={16} /> Project settings</button>}
            {editable && <button className="btn btn-dark" onClick={openNewTask} disabled={!projects.length} title={!projects.length ? "Add a project first" : "Create a new task"}><Plus size={16} /> Add task</button>}
            {editable && <button className="btn btn-light" onClick={() => setVoiceOpen(true)}><Mic size={16}/> AI Assistant</button>}
            <div className="export-wrapper" ref={exportMenuRef}>
              <button type="button" className="btn btn-light" onClick={() => setExportOpen(open => !open)}
                aria-expanded={exportOpen} aria-haspopup="true" aria-controls="csv-export-options" disabled={exporting}>
                {exporting ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
                {exporting ? "Exporting..." : "Export CSV"}<ChevronDown size={14} />
              </button>
              {exportOpen && <div id="csv-export-options" className="export-menu" role="group" aria-label="CSV export options">
                <button type="button" onClick={() => void exportCsv(null, "clients")}><Download size={15} /><span>Client projects CSV<small>Excludes LMS tasks</small></span></button>
                {lmsProject && <button type="button" onClick={() => void exportCsv(lmsProject)}><ListTodo size={15} /><span>LMS CSV<small>Only LMS tasks</small></span></button>}
                <button type="button" onClick={() => void exportCsv(null)}><Download size={15} /><span>Everything CSV<small>Client projects + LMS</small></span></button>
                {selectedProject && !isLmsPage && <button type="button" onClick={() => void exportCsv(selectedProject)}><Folder size={15} /><span>{selectedProject.name} CSV<small>Only this project</small></span></button>}
                {!selectedProject && sortedClientProjects.length > 0 && <>
                  <div className="export-menu-label">EXPORT ONE CLIENT PROJECT</div>
                  <div className="export-project-list">
                    {sortedClientProjects.map(project => <button type="button" key={project.id} onClick={() => void exportCsv(project)}>
                      <Folder size={15}/><span>{project.name}<small>Project tasks CSV</small></span>
                    </button>)}
                  </div>
                </>}
              </div>}
            </div>
          </div></div>

          <div className={`summary-grid ${isMaster && lmsProject ? "summary-grid-five" : ""}`}>
            <div className="stat-card"><span className="stat-heading"><ListTodo size={16} />Active tasks</span><div className="stat-number">{taskCount}</div><span className="stat-foot">{isMaster ? "Client projects only" : "In this project"}</span></div>
            <div className="stat-card"><span className="stat-heading"><CalendarDays size={16} />Due today</span><div className="stat-number">{dueToday}</div><span className="stat-foot">{isMaster ? "Client deadlines" : "Needs attention today"}</span></div>
            <div className="stat-card"><span className="stat-heading"><AlertCircle size={16} />Overdue</span><div className="stat-number">{overdueCount}</div><span className="stat-foot">Open tasks past deadline</span></div>
            <div className="stat-card"><span className="stat-heading"><CheckCircle2 size={16} />Completed</span><div className="stat-number">{scopedTasks.filter(t => t.status === "completed").length}</div><span className="stat-foot">Total finished tasks</span></div>
            {isMaster && lmsProject && <button type="button" className="stat-card stat-link" onClick={() => { setActiveTab(lmsProject.id); setSearch(""); }} aria-label={`Open LMS with ${lmsActiveTasks.length} active tasks`}>
              <span className="stat-heading"><ListTodo size={16} />LMS active tasks</span><div className="stat-number">{lmsActiveTasks.length}</div><span className="stat-foot">Separate development backlog <ArrowRight size={12}/></span>
            </button>}
          </div>

          {selectedProject && (selectedProject.name.trim().toLowerCase() === "lms" || modules.some(module => module.project_id === selectedProject.id)) &&
            <ModuleOverview project={selectedProject} modules={modules} tasks={scopedTasks} editable={editable}
              onSaved={refresh} onAddTask={moduleId => setTaskDialog({ open: true, task: null, moduleId })} />}
          {!editable && <div className="access-notice"><ShieldCheck size={16} /> You have read-only access. Adding, editing and deleting require an admin account.</div>}
          {editable && !projects.length && !busyLoading && <div className="getting-started">
            <div><strong>Start with your first project</strong><p>Create a project, then add tasks with deadlines and priorities.</p></div>
            <button className="btn btn-dark" onClick={() => setProjectDialog({ open: true, project: null })}><FolderPlus size={16}/> Add first project</button>
          </div>}
          {editable && projects.length > 0 && !tasks.length && !busyLoading && <div className="getting-started">
            <div><strong>Ready to add your first task?</strong><p>Tasks you create are saved to Supabase and appear in the Master Dashboard.</p></div>
            <button className="btn btn-dark" onClick={openNewTask}><Plus size={16}/> Add first task</button>
          </div>}
          {exportError && <div role="alert" className="alert error-alert content-error"><AlertCircle size={18} />{exportError}<button className="btn btn-light" onClick={() => setExportError(null)}>Dismiss</button></div>}
          {loadError && <div role="alert" className="alert error-alert content-error"><AlertCircle size={18} />{loadError} <button className="btn btn-light" onClick={() => void refresh()}>Retry</button></div>}
          <div className="workspace-toolbar"><div className="workspace-heading"><h2>{isMaster ? "Client project tasks" : isLmsPage ? "LMS task board" : "Task board"}</h2><span className="count-badge">{visibleTasks.length} tasks</span></div>
            <label className="search-box"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} aria-label="Search tasks" placeholder={isMaster ? "Search client tasks..." : "Search tasks..."} /></label>
          </div>

          {busyLoading ? <div className="board-loading"><Loader2 className="spin" size={26} /> Loading tasks...</div> : (
            <div className="board-grid">
              <section className="board-panel">
                <div className="panel-heading"><div className="panel-heading-title"><div className="heading-icon active-icon"><ListTodo size={16}/></div><div><h3>Active Tasks</h3><span>Sorted by priority, then progress</span></div></div><span className="count-badge">{activeTasks.length}</span></div>
                <div className="panel-content">
                  {PRIORITIES.map(priority => {
                    const group = shownActiveTasks.filter(t => t.priority === priority);
                    const totalInPriority = activeTasks.filter(t => t.priority === priority).length;
                    if (!group.length) return null;
                    return <div key={priority} className="priority-section"><div className="section-title"><span className={`priority-dot ${priority}`} />{priorityText[priority]}<span>{totalInPriority}</span></div>
                      <div className="task-stack">{group.map(task => <TaskCard key={task.id} task={task} projectName={projectMap.get(task.project_id) ?? "Unknown project"} moduleName={task.module_id ? moduleMap.get(task.module_id) : undefined} editable={editable} onEdit={task => setTaskDialog({ open: true, task })} onStatusChange={setStatus} />)}</div>
                    </div>;
                  })}
                  {!activeTasks.length && <EmptyBox title="Nothing in progress" detail={projects.length ? "Add a task or change its status to Pending or In progress." : "Add your first project to start tracking tasks."} />}
                  {paginateClientBoard && <BoardPagination label="Active tasks" page={currentActivePage} total={activeTasks.length} pageSize={ACTIVE_PAGE_SIZE} onChange={setActivePage} />}
                </div>
              </section>
              <div className="right-panels">
                <section className="board-panel">
                  <div className="panel-heading"><div className="panel-heading-title"><div className="heading-icon approval-icon"><Clock3 size={16} /></div><div><h3>Waiting for Approval</h3><span>Ready for review</span></div></div><span className="count-badge">{approvalTasks.length}</span></div>
                  <div className="panel-content"><div className="task-stack">{shownApprovalTasks.map(task => <TaskCard key={task.id} task={task} projectName={projectMap.get(task.project_id) ?? "Unknown project"} moduleName={task.module_id ? moduleMap.get(task.module_id) : undefined} editable={editable} compact onEdit={task => setTaskDialog({ open: true, task })} onStatusChange={setStatus} />)}</div>
                    {!approvalTasks.length && <EmptyBox title="No approvals pending" detail="Tasks awaiting approval will appear here." />}
                    {paginateClientBoard && <BoardPagination label="Waiting for approval" page={currentApprovalPage} total={approvalTasks.length} pageSize={SIDE_PAGE_SIZE} onChange={setApprovalPage} />}</div>
                </section>
                <section className="board-panel">
                  <div className="panel-heading"><div className="panel-heading-title"><div className="heading-icon complete-icon"><CheckCircle2 size={16} /></div><div><h3>Completed Tasks</h3><span>Finished and delivered</span></div></div><span className="count-badge">{completedTasks.length}</span></div>
                  <div className="panel-content"><div className="task-stack">{shownCompletedTasks.map(task => <TaskCard key={task.id} task={task} projectName={projectMap.get(task.project_id) ?? "Unknown project"} moduleName={task.module_id ? moduleMap.get(task.module_id) : undefined} editable={editable} compact onEdit={task => setTaskDialog({ open: true, task })} onStatusChange={setStatus} />)}</div>
                    {!completedTasks.length && <EmptyBox title="No completed tasks yet" detail="Finished tasks will appear in this section." />}
                    {paginateClientBoard && <BoardPagination label="Completed tasks" page={currentCompletedPage} total={completedTasks.length} pageSize={SIDE_PAGE_SIZE} onChange={setCompletedPage} />}</div>
                </section>
              </div>
            </div>
          )}
          {isMaster && lmsProject && (
            <section className="lms-overview" aria-label="LMS tasks overview">
              <div className="lms-overview-heading">
                <div>
                  <div className="eyebrow">DEVELOPMENT BACKLOG</div>
                  <div className="workspace-heading"><h2>LMS tasks</h2><span className="count-badge">{lmsTasks.length} tasks</span></div>
                  <p>Tracked separately from client projects.</p>
                </div>
                <button type="button" className="btn btn-light" onClick={() => { setActiveTab(lmsProject.id); setSearch(""); }}>
                  View all LMS tasks <ArrowRight size={15} />
                </button>
              </div>
              <div className="lms-overview-stats">
                <span><span className="priority-dot high"/> {lmsActiveTasks.length} active</span>
                <span><Clock3 size={14}/> {lmsWaitingCount} awaiting approval</span>
                <span><CheckCircle2 size={14}/> {lmsCompletedCount} completed</span>
              </div>
              <div className="lms-preview-list">
                {lmsActiveTasks.slice(0, 6).map(task => (
                  <TaskCard key={task.id} task={task} projectName="LMS" moduleName={task.module_id ? moduleMap.get(task.module_id) : undefined}
                    editable={editable} compact onEdit={task => setTaskDialog({ open: true, task })} onStatusChange={setStatus} />
                ))}
                {lmsActiveTasks.length === 0 && <EmptyBox title="No active LMS tasks" detail="Open LMS to view its full development backlog and modules." />}
              </div>
              {lmsActiveTasks.length > 6 && <button type="button" className="lms-preview-more" onClick={() => { setActiveTab(lmsProject.id); setSearch(""); }}>
                + {lmsActiveTasks.length - 6} more active LMS tasks <ArrowRight size={14}/>
              </button>}
            </section>
          )}
          <div className="page-footer">Changes are saved to Supabase and synchronized across signed-in devices. <span>Workboard v1.5</span></div>
        </div>
      </main>
      {voiceOpen && <VoiceAssistant projects={projects} existingTasks={tasks} onClose={() => setVoiceOpen(false)} onSaved={refresh}/>}
      {taskDialog.open && <TaskDialog key={taskDialog.task?.id ?? `new-${activeTab}-${taskDialog.moduleId ?? ""}`} initial={taskDialog.task}
        projects={selectedProject ? [selectedProject, ...projects.filter(p => p.id !== selectedProject.id)] : projects}
        modules={modules} preferredModuleId={taskDialog.moduleId}
        onClose={() => setTaskDialog({ open: false, task: null })} onSave={saveTask} onDelete={deleteTask} />}
      {projectDialog.open && <ProjectDialog key={projectDialog.project?.id ?? "new"} initial={projectDialog.project}
        onClose={() => setProjectDialog({ open: false, project: null })} onSave={saveProject} onDelete={deleteProject} />}
    </div>
  );
}
