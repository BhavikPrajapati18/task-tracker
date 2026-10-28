"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Circle, Clock3, FolderPlus, Loader2, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { readableDate } from "@/lib/helpers";
import type { ModuleRole, ModuleStatus, Project, ProjectModule, Task } from "@/lib/types";

const ROLES: { value: ModuleRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "teacher", label: "Teacher" },
  { value: "student", label: "Student" },
];
const STATUS_LABELS: Record<ModuleStatus, string> = {
  completed: "Completed", in_progress: "In progress", not_started: "Not started",
};
const STATUS_ICONS = { completed: CheckCircle2, in_progress: Clock3, not_started: Circle };

type Props = {
  project: Project;
  modules: ProjectModule[];
  tasks: Task[];
  editable: boolean;
  onSaved: () => Promise<void>;
  onAddTask: (moduleId: string) => void;
};

export default function ModuleOverview({ project, modules, tasks, editable, onSaved, onAddTask }: Props) {
  const [role, setRole] = useState<ModuleRole>("owner");
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const scoped = useMemo(() => modules
    .filter(module => module.project_id === project.id && module.role === role)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [modules, project.id, role]);
  const completed = scoped.filter(module => module.status === "completed").length;
  const inProgress = scoped.filter(module => module.status === "in_progress").length;
  const notStarted = scoped.filter(module => module.status === "not_started").length;
  const percent = scoped.length ? Math.round((completed / scoped.length) * 100) : 0;

  async function changeStatus(module: ProjectModule, status: ModuleStatus) {
    if (!editable || busyId) return;
    setError(""); setBusyId(module.id);
    const { error: updateError } = await supabase.from("project_modules")
      .update({ status }).eq("id", module.id).eq("project_id", project.id);
    if (updateError) setError(updateError.message);
    else await onSaved();
    setBusyId(null);
  }

  async function addModule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || busyId || !name.trim()) return;
    setError(""); setBusyId("create");
    const { error: insertError } = await supabase.from("project_modules").insert({
      project_id: project.id, role, name: name.trim(), status: "not_started",
      sort_order: (Math.max(0, ...scoped.map(module => module.sort_order)) + 10),
    });
    if (insertError) setError(insertError.message);
    else { setName(""); setShowAdd(false); await onSaved(); }
    setBusyId(null);
  }

  return (
    <section className="module-overview" aria-label="Project module overview">
      <div className="module-heading">
        <div>
          <div className="eyebrow">PRODUCT DEVELOPMENT</div>
          <h2>Module overview</h2>
          <p>Track modules by application role. Module status is separate from task priority.</p>
        </div>
        <span className="module-priority">{project.priority === "high" ? "High-priority project" : `${project.priority} priority project`}</span>
      </div>

      <div className="module-role-tabs" role="tablist" aria-label="Application roles">
        {ROLES.map(item => <button key={item.value} type="button" role="tab" aria-selected={role === item.value}
          className={`module-role-tab ${role === item.value ? "selected" : ""}`}
          onClick={() => { setRole(item.value); setShowAdd(false); setError(""); }}>
          {item.label}
          {role === item.value && <span>{scoped.length}</span>}
        </button>)}
      </div>

      {scoped.length > 0 ? <>
        <div className="module-progress">
          <div className="module-progress-top"><strong>{completed} of {scoped.length} modules completed</strong><span>{percent}% by module count</span></div>
          <div className="module-progress-track"><div className="module-progress-fill" style={{ width: `${percent}%` }} /></div>
          <div className="module-progress-stats">
            <span><b>{completed}</b> completed</span><span><b>{inProgress}</b> in progress</span><span><b>{notStarted}</b> not started</span>
          </div>
          <p className="module-progress-note">This counts finished modules equally; it is not an effort-weighted development estimate.</p>
        </div>
        <div className="module-cards">
          {scoped.map(module => {
            const Icon = STATUS_ICONS[module.status];
            const linked = tasks.filter(task => task.module_id === module.id);
            return <article key={module.id} className="module-card">
              <div className="module-card-top">
                <span className={`module-state module-state-${module.status}`}><Icon size={14} />{STATUS_LABELS[module.status]}</span>
                {busyId === module.id && <Loader2 size={15} className="spin" />}
              </div>
              <h3>{module.name}</h3>
              <div className="module-task-count">{linked.length} linked {linked.length === 1 ? "task" : "tasks"}</div>
              {linked.length > 0 && <ul className="module-linked-tasks">{linked.slice(0, 4).map(task =>
                <li key={task.id}><span>{task.title}</span>{task.due_date && <small>{readableDate(task.due_date)}</small>}</li>
              )}{linked.length > 4 && <li className="muted">+ {linked.length - 4} more in task board</li>}</ul>}
              <div className="module-card-actions">
                {editable && <label className="module-status-input">Status
                  <select className="input" value={module.status} disabled={busyId !== null}
                    onChange={event => void changeStatus(module, event.target.value as ModuleStatus)}
                    aria-label={`Status for ${role} ${module.name}`}>
                    <option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="completed">Completed</option>
                  </select>
                </label>}
                {editable && <button type="button" className="btn btn-light" onClick={() => onAddTask(module.id)}><Plus size={13} /> Task</button>}
              </div>
            </article>;
          })}
        </div>
      </> : <div className="module-role-empty">
        <FolderPlus size={22} />
        <strong>No {role} modules configured yet</strong>
        <p>Only Owner modules are defined right now. Add modules here when this role's scope is ready.</p>
      </div>}

      {error && <div role="alert" className="alert error-alert module-error">{error}</div>}
      {editable && <div className="module-add-area">
        {!showAdd ? <button type="button" className="btn btn-light" onClick={() => setShowAdd(true)}><Plus size={15} /> Add {role} module</button>
          : <form onSubmit={addModule} className="module-add-form">
            <input className="input" autoFocus required maxLength={100} placeholder={`New ${role} module`} value={name} onChange={e => setName(e.target.value)} />
            <button type="submit" disabled={!!busyId} className="btn btn-dark">{busyId === "create" ? <Loader2 className="spin" size={14}/> : <Plus size={14}/>} Add</button>
            <button type="button" className="btn btn-light" onClick={() => { setShowAdd(false); setName(""); }}>Cancel</button>
          </form>}
      </div>}
    </section>
  );
}
