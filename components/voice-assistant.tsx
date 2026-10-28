"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, Check, CheckCircle2, Loader2, Mic, MicOff, Sparkles,
  Trash2, WandSparkles, X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { localDateKey, PRIORITIES, priorityText, STATUSES, statusText } from "@/lib/helpers";
import type { Priority, Project, Task, TaskStatus } from "@/lib/types";

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { results: ArrayLike<SpeechResult> };
type SpeechError = { error: string };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: SpeechError) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

type Candidate = {
  project_id: string;
  title: string;
  description: string;
  due_date: string;
  priority: Priority;
  status: TaskStatus;
  estimated_hours: string;
  warning: string;
};
type Draft = Candidate & { rowId: number; included: boolean };

type Props = {
  projects: Project[];
  existingTasks: Task[];
  onClose: () => void;
  onSaved: () => Promise<void>;
};

const normalized = (text: string) => text.trim().toLocaleLowerCase().replace(/\s+/g, " ");
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`))
  && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

export default function VoiceAssistant({ projects, existingTasks, onClose, onSaved }: Props) {
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [language, setLanguage] = useState("en-IN");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState<"parse" | "save" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const recognitionRef = useRef<Recognition | null>(null);
  const baseRef = useRef("");
  const transcriptRef = useRef("");
  const nextIdRef = useRef(1);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const win = window as RecognitionWindow;
    setSupported(Boolean(win.SpeechRecognition || win.webkitSpeechRecognition));
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("keydown", onEscape);
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.abort();
      }
    };
  }, []);

  const setText = useCallback((value: string) => {
    transcriptRef.current = value;
    setTranscript(value);
    // Parsed results no longer reflect this transcript.
    setDrafts([]);
    setMessage("");
  }, []);

  function startRecording() {
    if (busy || recording) return;
    const win = window as RecognitionWindow;
    const Constructor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!Constructor) {
      setError("Speech recognition is not available in this browser. Type tasks in the transcript box instead.");
      return;
    }
    setError("");
    setMessage("");
    const recognition = new Constructor();
    baseRef.current = transcriptRef.current.trim();
    recognitionRef.current = recognition;
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const finalParts: string[] = [];
      const interimParts: string[] = [];
      // Rebuild this recognition session's text on every result callback,
      // instead of appending the same final result repeatedly.
      for (let i = 0; i < event.results.length; i++) {
        const text = event.results[i]?.[0]?.transcript?.trim();
        if (!text) continue;
        if (event.results[i].isFinal) finalParts.push(text);
        else interimParts.push(text);
      }
      const complete = [baseRef.current, ...finalParts].filter(Boolean).join(" ").trim();
      transcriptRef.current = complete;
      setTranscript(complete);
      setInterim(interimParts.join(" "));
      setDrafts([]);
    };
    recognition.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(`Microphone: ${event.error}. You can continue by typing or try another language.`);
      }
    };
    recognition.onend = () => {
      setInterim("");
      setRecording(false);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
    };
    try {
      recognition.start();
      setRecording(true);
    } catch (cause) {
      setRecording(false);
      setError(cause instanceof Error ? cause.message : "Could not start microphone.");
      recognitionRef.current = null;
    }
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    // onend clears the active recording state; retain recognized text.
  }

  async function parseTasks() {
    if (busy || recording) return;
    if (!projects.length) {
      setError("Add or import projects before parsing tasks. The assistant will not invent new projects.");
      return;
    }
    const text = transcriptRef.current.trim();
    if (text.length < 10) { setError("Write or say a few task details first."); return; }
    if (text.length > 12000) { setError("Transcript too long. Split it into smaller batches (maximum 12,000 characters)."); return; }

    setError(""); setMessage(""); setBusy("parse"); setDrafts([]);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Session expired. Sign in again.");
      const { data, error: functionError } = await supabase.functions.invoke("parse-tasks", {
        body: {
          transcript: text,
          localDate: localDateKey(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
        },
      });
      if (functionError) {
        // FunctionHttpError exposes the response body here in Supabase JS v2.
        const context = "context" in functionError ? functionError.context : undefined;
        let detail = functionError.message;
        if (context instanceof Response) {
          const body = await context.clone().json().catch(() => null);
          if (typeof body?.error === "string") detail = body.error;
        }
        throw new Error(detail);
      }
      if (!data || !Array.isArray(data.tasks)) throw new Error("The AI returned an invalid response. Try again.");
      const parsed = (data.tasks as Candidate[]).slice(0, 50).map(candidate => {
        const projectValid = projects.some(p => p.id === candidate.project_id);
        const dateValid = !candidate.due_date || validDate(candidate.due_date);
        const row: Draft = {
          rowId: nextIdRef.current++,
          included: Boolean(projectValid && candidate.title?.trim() && dateValid && !String(candidate.warning ?? "").trim()),
          project_id: projectValid ? candidate.project_id : "",
          title: String(candidate.title ?? "").slice(0, 200),
          description: String(candidate.description ?? "").slice(0, 3000),
          due_date: dateValid ? (candidate.due_date || "") : "",
          priority: PRIORITIES.includes(candidate.priority) ? candidate.priority : "medium",
          status: STATUSES.includes(candidate.status) ? candidate.status : "pending",
          estimated_hours: candidate.estimated_hours === "" || candidate.estimated_hours == null ? "" : String(candidate.estimated_hours),
          warning: String(candidate.warning ?? "").slice(0, 250),
        };
        if (!projectValid) row.warning = [row.warning, "Project needs selection."].filter(Boolean).join(" ");
        if (!dateValid) row.warning = [row.warning, "Date needs review."].filter(Boolean).join(" ");
        return row;
      });
      setDrafts(parsed);
      setMessage(parsed.length ? `Found ${parsed.length} task${parsed.length === 1 ? "" : "s"}. Review everything before saving.` : "No tasks detected. Try adding explicit project names and action items.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to process transcript.");
    } finally { setBusy(null); }
  }

  function updateDraft(rowId: number, patch: Partial<Draft>) {
    setDrafts(prev => prev.map(row => row.rowId === rowId ? { ...row, ...patch } : row));
  }

  const duplicateKeys = useMemo(() => new Set(existingTasks.map(task => `${task.project_id}::${normalized(task.title)}`)), [existingTasks]);
  const selected = drafts.filter(d => d.included);
  const invalidSelected = selected.filter(d => !d.project_id || !d.title.trim() || d.title.length > 200
    || (d.due_date && !validDate(d.due_date)) || (d.estimated_hours && (!Number.isFinite(Number(d.estimated_hours)) || Number(d.estimated_hours) < 0 || Number(d.estimated_hours) > 9999.99)));
  const duplicates = selected.filter((row, index) => duplicateKeys.has(`${row.project_id}::${normalized(row.title)}`)
    || selected.findIndex(other => other.project_id === row.project_id && normalized(other.title) === normalized(row.title)) !== index);

  async function saveTasks() {
    if (busy || !selected.length || invalidSelected.length || duplicates.length) return;
    setError(""); setMessage(""); setBusy("save");
    try {
      const payloads = selected.map(row => ({
        project_id: row.project_id,
        title: row.title.trim(),
        description: row.description.trim() || null,
        priority: row.priority,
        status: row.status,
        due_date: row.due_date || null,
        estimated_hours: row.estimated_hours.trim() ? Number(row.estimated_hours) : null,
        completed_at: row.status === "completed" ? new Date().toISOString() : null,
      }));
      // One batch request. Supabase RLS verifies admin permissions and the
      // foreign key verifies project IDs; no service-role key in the browser.
      const { error: insertError } = await supabase.from("tasks").insert(payloads);
      if (insertError) throw new Error(insertError.message);
      setDrafts(prev => prev.filter(row => !row.included));
      try { await onSaved(); } catch { /* Realtime/focus will refresh after successful insert. */ }
      setMessage(`${payloads.length} task${payloads.length === 1 ? "" : "s"} added successfully. Open your Master Dashboard or project tab to see them.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save tasks.");
    } finally { setBusy(null); }
  }

  return (
    <div className="voice-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="voice-dialog" role="dialog" aria-modal="true" aria-label="Voice task assistant">
        <div className="voice-header">
          <div className="voice-header-icon"><Sparkles size={22}/></div>
          <div className="voice-header-text"><div className="eyebrow">WORKBOARD ASSISTANT</div><h2>Voice & text tasks</h2><p>Dictate tasks for multiple projects, review, then save.</p></div>
          <button type="button" className="icon-btn" aria-label="Close assistant" onClick={onClose}><X size={20}/></button>
        </div>
        <div className="voice-body">
          <div className="voice-section-head"><strong>1. Describe your tasks</strong><span>{transcript.length}/12,000 characters</span></div>
          <p className="voice-helper">Example: “DSW ki press release update karni hai Friday tak, high priority. JWS ke city components kal complete karne hain.”</p>
          <div className="voice-record-row">
            <button type="button" className={`btn ${recording ? "btn-danger" : "btn-dark"}`} onClick={recording ? stopRecording : startRecording} disabled={Boolean(busy) || supported === false}>
              {recording ? <><MicOff size={16}/> Stop recording</> : <><Mic size={16}/> {transcript ? "Continue recording" : "Start recording"}</>}
            </button>
            <label className="voice-lang-label">Recognition language
              <select className="input" value={language} onChange={e => setLanguage(e.target.value)} disabled={recording}>
                <option value="en-IN">English / Hinglish (India)</option><option value="hi-IN">Hindi (India)</option><option value="en-US">English (US)</option>
              </select>
            </label>
            {recording && <span className="voice-recording"><span className="voice-record-dot"/> Listening...</span>}
          </div>
          {supported === false && <p className="voice-helper">Microphone speech recognition is unsupported in this browser. You can type or paste your task list below.</p>}
          <textarea className="input voice-transcript" rows={6} maxLength={12000} placeholder="Speak or type: Project name, task title, deadline, priority, status..." value={transcript} onChange={event => setText(event.target.value)} disabled={recording || Boolean(busy)} />
          {interim && <div className="voice-interim">Hearing: {interim}</div>}
          <div className="voice-action-row">
            <span className="voice-helper">Audio isn't stored in Supabase. Only tasks you approve are saved.</span>
            <button type="button" className="btn btn-light" disabled={Boolean(busy) || recording || !transcript} onClick={() => { setText(""); setError(""); }}>Clear</button>
            <button type="button" className="btn btn-dark" onClick={() => void parseTasks()} disabled={Boolean(busy) || recording || transcript.trim().length < 10 || !projects.length}>
              {busy === "parse" ? <Loader2 className="spin" size={16}/> : <WandSparkles size={16}/>} {busy === "parse" ? "Processing..." : "Extract tasks"}
            </button>
          </div>
          {!projects.length && <div className="alert error-alert"><AlertCircle size={17}/> No projects found. Import your project list first; the assistant never creates projects automatically.</div>}
          {error && <div role="alert" className="alert error-alert"><AlertCircle size={17}/>{error}</div>}
          {message && <div role="status" className="voice-success"><CheckCircle2 size={17}/>{message}</div>}
          {drafts.length > 0 && <>
            <div className="voice-review-head"><div><strong>2. Review proposed tasks</strong><p>Edit project, deadline and priority before saving.</p></div><span className="count-badge">{selected.length} selected / {drafts.length}</span></div>
            <div className="voice-draft-list">
              {drafts.map((row, i) => {
                const isDuplicate = duplicateKeys.has(`${row.project_id}::${normalized(row.title)}`) || drafts.some(other => other.rowId !== row.rowId && other.included && other.project_id === row.project_id && normalized(other.title) === normalized(row.title));
                return <div className={`voice-draft ${row.included ? "" : "voice-draft-off"}`} key={row.rowId}>
                  <div className="voice-draft-top">
                    <label className="voice-select"><input type="checkbox" checked={row.included} onChange={e => updateDraft(row.rowId, { included: e.target.checked })}/> Task {i + 1}</label>
                    <button className="icon-btn" type="button" title="Remove draft" aria-label={`Remove draft ${i+1}`} onClick={() => setDrafts(prev => prev.filter(item => item.rowId !== row.rowId))}><Trash2 size={15}/></button>
                  </div>
                  <div className="voice-draft-fields">
                    <label>Project *
                      <select className="input" value={row.project_id} onChange={e => updateDraft(row.rowId, { project_id: e.target.value })}><option value="">Select project...</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
                    </label>
                    <label>Task *<input className="input" value={row.title} maxLength={200} onChange={e => updateDraft(row.rowId, { title: e.target.value })}/></label>
                    <label>Deadline<input className="input" type="date" value={row.due_date} onChange={e => updateDraft(row.rowId, { due_date: e.target.value })}/></label>
                    <label>Priority<select className="input" value={row.priority} onChange={e => updateDraft(row.rowId, { priority: e.target.value as Priority })}>{PRIORITIES.map(p => <option value={p} key={p}>{priorityText[p]}</option>)}</select></label>
                    <label>Status<select className="input" value={row.status} onChange={e => updateDraft(row.rowId, { status: e.target.value as TaskStatus })}>{STATUSES.map(s => <option value={s} key={s}>{statusText[s]}</option>)}</select></label>
                    <label>Estimated hours<input className="input" type="number" step="0.25" min="0" max="9999.99" placeholder="Optional" value={row.estimated_hours} onChange={e => updateDraft(row.rowId, { estimated_hours: e.target.value })}/></label>
                  </div>
                  <label className="voice-notes-label">Notes<textarea className="input textarea" rows={2} maxLength={3000} value={row.description} placeholder="Optional notes" onChange={e => updateDraft(row.rowId, { description: e.target.value })}/></label>
                  {row.warning && <div className="voice-warning"><AlertCircle size={14}/>{row.warning}</div>}
                  {isDuplicate && <div className="voice-warning"><AlertCircle size={14}/>Potential duplicate task. Deselect or change the title/project before saving.</div>}
                </div>;
              })}
            </div>
            {Boolean(invalidSelected.length || duplicates.length) && <div role="alert" className="alert error-alert"><AlertCircle size={17}/>
              Fix {invalidSelected.length} invalid and {duplicates.length} duplicate selected task(s), or uncheck those rows.
            </div>}
            <div className="voice-save-row"><span>Saving creates only selected tasks. No projects are created.</span>
              <button type="button" className="btn btn-dark" onClick={() => void saveTasks()} disabled={Boolean(busy) || !selected.length || Boolean(invalidSelected.length || duplicates.length)}>
                {busy === "save" ? <Loader2 className="spin" size={16}/> : <Check size={16}/>} {busy === "save" ? "Saving..." : `Save ${selected.length} task${selected.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}
