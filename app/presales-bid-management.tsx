"use client";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  Eye,
  Loader2,
  Paperclip,
  Plus,
  Search,
  Target,
  Trash2,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Template = {
  id: number;
  sequence_no: number;
  stage_name: string;
  accountable_group: string;
  control_type: string;
  target_days: number | null;
  timing_anchor: string;
  required_documents: string;
};
type Project = {
  id?: number;
  bid_reference: string;
  customer_name: string;
  project_name: string;
  opportunity_value: number;
  owner: string;
  priority: string;
  bid_status: string;
  start_date: string;
  expected_bid_date: string | null;
  remarks: string;
  current_stage_id?: number;
  current_stage?: {
    stage_name: string;
    sequence_no: number;
    accountable_group: string;
  };
  updated_at?: string;
};
type Stage = {
  id: number;
  project_id: number;
  stage_id: number;
  status: string;
  outcome: string;
  assigned_to: string;
  planned_start: string | null;
  due_date: string | null;
  actual_start: string | null;
  completed_date: string | null;
  documents_complete: boolean;
  notes: string;
  updated_by_email: string;
  updated_at: string;
  stage: Template;
};
type Attachment = {
  id: number;
  project_id: number;
  history_id: number;
  file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_by_email: string;
  created_at: string;
  download_url: string;
};
type Payload = {
  role: string;
  templates: Template[];
  projects: Project[];
  history: Stage[];
  attachments: Attachment[];
};
const blank: Project = {
  bid_reference: "",
  customer_name: "",
  project_name: "",
  opportunity_value: 0,
  owner: "",
  priority: "Medium",
  bid_status: "Active",
  start_date: new Date().toISOString().slice(0, 10),
  expected_bid_date: null,
  remarks: "",
};
const emptyProjects: Project[] = [];
const emptyHistory: Stage[] = [];
const money = (n: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(n || 0);
const csv = (value: unknown) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;
const today = () => new Date().toISOString().slice(0, 10);

export default function PresalesBidManagement() {
  const [data, setData] = useState<Payload | null>(null),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All"),
    [edit, setEdit] = useState<Project | null>(null),
    [selected, setSelected] = useState<Project | null>(null),
    [stageEdit, setStageEdit] = useState<Stage | null>(null);
  const load = () =>
    fetch("/api/presales")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setData(j);
      })
      .catch((e) => toast.error(e.message));
  useEffect(() => {
    load();
  }, []);
  const projects = data?.projects || emptyProjects,
    history = data?.history || emptyHistory;
  const visible = projects
    .filter((p) => filter === "All" || p.bid_status === filter)
    .filter((p) =>
      (
        p.bid_reference +
        p.customer_name +
        p.project_name +
        p.owner +
        (p.current_stage?.stage_name || "")
      )
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  const stats = useMemo(() => {
    const active = projects.filter((p) => p.bid_status === "Active"),
      decided = projects.filter(
        (p) => p.bid_status === "Won" || p.bid_status === "Lost",
      ),
      completed = history.filter((h) => h.status === "Completed"),
      onTime = completed.filter(
        (h) =>
          !h.due_date || (!!h.completed_date && h.completed_date <= h.due_date),
      ),
      overdue = history.filter(
        (h) =>
          ["In Progress", "Blocked"].includes(h.status) &&
          !!h.due_date &&
          h.due_date < today(),
      );
    return {
      active: active.length,
      pipeline: active.reduce((s, p) => s + Number(p.opportunity_value), 0),
      won: projects.filter((p) => p.bid_status === "Won").length,
      winRate: decided.length
        ? (projects.filter((p) => p.bid_status === "Won").length /
            decided.length) *
          100
        : 0,
      onTime: completed.length ? (onTime.length / completed.length) * 100 : 0,
      overdue: overdue.length,
    };
  }, [projects, history]);
  async function save(action: string, value: Project | Stage) {
    const res = await fetch("/api/presales", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, value }),
      }),
      json = await res.json();
    if (!res.ok) return toast.error(json.error || "Could not save");
    setData(json);
    setEdit(null);
    setStageEdit(null);
    if (selected)
      setSelected(
        json.projects.find((p: Project) => p.id === selected.id) || null,
      );
    toast.success(action === "stage" ? "Stage updated" : "Project saved");
  }
  function exportData() {
    const head = [
      "Bid Reference",
      "Customer",
      "Project",
      "Value",
      "Owner",
      "Priority",
      "Bid Status",
      "Current Stage",
      "Stage Status",
      "Assigned To",
      "Planned Start",
      "Due Date",
      "Actual Start",
      "Completed Date",
      "Documents Complete",
      "Notes",
    ];
    const rows = projects.flatMap((p) => {
      const stages = history
        .filter((h) => h.project_id === p.id)
        .sort((a, b) => a.stage.sequence_no - b.stage.sequence_no);
      return stages.map((h) => [
        p.bid_reference,
        p.customer_name,
        p.project_name,
        p.opportunity_value,
        p.owner,
        p.priority,
        p.bid_status,
        h.stage.stage_name,
        h.status,
        h.assigned_to,
        h.planned_start,
        h.due_date,
        h.actual_start,
        h.completed_date,
        h.documents_complete ? "Yes" : "No",
        h.notes,
      ]);
    });
    const blob = new Blob(
      [[head, ...rows].map((r) => r.map(csv).join(",")).join("\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `presales-bid-register-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  if (!data)
    return (
      <section className="workspace">
        <div className="empty">Loading Pre-Sales & Bid Management…</div>
      </section>
    );
  return (
    <section className="workspace presales-workspace">
      <div className="presales-summary">
        <article>
          <Target />
          <span>Active bids</span>
          <b>{stats.active}</b>
        </article>
        <article>
          <span>Active pipeline</span>
          <b>{money(stats.pipeline)}</b>
        </article>
        <article>
          <Trophy />
          <span>Bid win rate</span>
          <b>{stats.winRate.toFixed(0)}%</b>
        </article>
        <article>
          <span>On-time stages</span>
          <b>{stats.onTime.toFixed(0)}%</b>
        </article>
        <article className={stats.overdue ? "danger" : ""}>
          <AlertTriangle />
          <span>Overdue stages</span>
          <b>{stats.overdue}</b>
        </article>
        <article>
          <span>Won projects</span>
          <b>{stats.won}</b>
        </article>
      </div>
      <div className="toolbar">
        <div className="search">
          <Search />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search bid, customer, project, owner or stage…"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["All", "Active", "On Hold", "Won", "Lost", "Cancelled"].map(
              (x) => (
                <SelectItem key={x} value={x}>
                  {x}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportData}>
          <Download /> Export
        </Button>
        {data.role !== "Viewer" && (
          <Button onClick={() => setEdit({ ...blank })}>
            <Plus /> Add bid
          </Button>
        )}
      </div>
      <div className="data-card presales-card">
        <table>
          <thead>
            <tr>
              <th>Bid / Project</th>
              <th>Customer</th>
              <th>Value</th>
              <th>Owner</th>
              <th>Current SOP Stage</th>
              <th>Expected Bid</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const stages = history.filter((h) => h.project_id === p.id),
                done = stages.filter(
                  (h) => h.status === "Completed" || h.status === "Skipped",
                ).length,
                progress = stages.length ? (done / stages.length) * 100 : 0,
                current = stages.find((h) => h.stage_id === p.current_stage_id);
              return (
                <tr key={p.id}>
                  <td>
                    <b>{p.bid_reference}</b>
                    <span>{p.project_name}</span>
                  </td>
                  <td>{p.customer_name}</td>
                  <td>{money(p.opportunity_value)}</td>
                  <td>{p.owner || "—"}</td>
                  <td>
                    <b>
                      {p.current_stage?.sequence_no}.{" "}
                      {p.current_stage?.stage_name || "Not started"}
                    </b>
                    <small>{p.current_stage?.accountable_group}</small>
                    {current?.due_date && (
                      <small
                        className={
                          current.due_date < today() &&
                          current.status !== "Completed"
                            ? "overdue"
                            : ""
                        }
                      >
                        Due {current.due_date}
                      </small>
                    )}
                  </td>
                  <td>{p.expected_bid_date || "—"}</td>
                  <td>
                    <span
                      className={`status ${p.bid_status.toLowerCase().replaceAll(" ", "-")}`}
                    >
                      {p.bid_status}
                    </span>
                  </td>
                  <td>
                    <div className="presales-progress">
                      <i style={{ width: `${progress}%` }} />
                      <b>{progress.toFixed(0)}%</b>
                    </div>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelected(p)}
                      >
                        <Eye /> Track
                      </Button>
                      {data.role !== "Viewer" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEdit(p)}
                        >
                          Edit
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visible.length && <div className="empty">No matching bids.</div>}
      </div>
      <ProjectDialog
        item={edit}
        onClose={() => setEdit(null)}
        onSave={(v) => save("project", v)}
      />
      <Tracker
        project={selected}
        history={history}
        canEdit={data.role !== "Viewer"}
        onClose={() => setSelected(null)}
        onEdit={setStageEdit}
      />
      <StageDialog
        item={stageEdit}
        attachments={(data.attachments || []).filter(
          (a) => a.history_id === stageEdit?.id,
        )}
        onClose={() => setStageEdit(null)}
        onSave={(v) => save("stage", v)}
        onFilesChanged={load}
      />
    </section>
  );
}

function ProjectDialog({
  item,
  onClose,
  onSave,
}: {
  item: Project | null;
  onClose: () => void;
  onSave: (p: Project) => void;
}) {
  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      {item && (
        <ProjectForm
          key={item.id || "new"}
          item={item}
          onClose={onClose}
          onSave={onSave}
        />
      )}
    </Dialog>
  );
}
function ProjectForm({
  item,
  onClose,
  onSave,
}: {
  item: Project;
  onClose: () => void;
  onSave: (p: Project) => void;
}) {
  const [v, setV] = useState<Project>(() => ({ ...item }));
  const field = (key: keyof Project, value: unknown) =>
    setV((current) => ({ ...current, [key]: value }));
  return (
    <DialogContent className="presales-dialog">
      <DialogHeader>
        <DialogTitle>
          {item.id ? "Edit bid opportunity" : "Add bid opportunity"}
        </DialogTitle>
      </DialogHeader>
      <div className="form-grid">
        <label>
          Bid reference
          <Input
            value={v.bid_reference}
            onChange={(e) => field("bid_reference", e.target.value)}
            placeholder="BID-2026-001"
          />
        </label>
        <label>
          Customer
          <Input
            value={v.customer_name}
            onChange={(e) => field("customer_name", e.target.value)}
          />
        </label>
        <label className="wide">
          Project name
          <Input
            value={v.project_name}
            onChange={(e) => field("project_name", e.target.value)}
          />
        </label>
        <label>
          Opportunity value
          <Input
            type="number"
            value={v.opportunity_value}
            onChange={(e) => field("opportunity_value", Number(e.target.value))}
          />
        </label>
        <label>
          Owner
          <Input
            value={v.owner}
            onChange={(e) => field("owner", e.target.value)}
          />
        </label>
        <label>
          Priority
          <Select
            value={v.priority}
            onValueChange={(x) => field("priority", x)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Critical", "High", "Medium", "Low"].map((x) => (
                <SelectItem key={x} value={x}>
                  {x}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label>
          Bid status
          <Select
            value={v.bid_status}
            onValueChange={(x) => field("bid_status", x)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Active", "On Hold", "Won", "Lost", "Cancelled"].map((x) => (
                <SelectItem key={x} value={x}>
                  {x}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label>
          Start date
          <Input
            type="date"
            value={v.start_date}
            onChange={(e) => field("start_date", e.target.value)}
          />
        </label>
        <label>
          Expected bid date
          <Input
            type="date"
            value={v.expected_bid_date || ""}
            onChange={(e) => field("expected_bid_date", e.target.value || null)}
          />
        </label>
        <label className="wide">
          Remarks
          <textarea
            value={v.remarks}
            onChange={(e) => field("remarks", e.target.value)}
          />
        </label>
      </div>
      <div className="dialog-actions">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSave(v)}>Save bid</Button>
      </div>
    </DialogContent>
  );
}

function Tracker({
  project,
  history,
  canEdit,
  onClose,
  onEdit,
}: {
  project: Project | null;
  history: Stage[];
  canEdit: boolean;
  onClose: () => void;
  onEdit: (s: Stage) => void;
}) {
  const stages = history
    .filter((h) => h.project_id === project?.id)
    .sort((a, b) => a.stage.sequence_no - b.stage.sequence_no);
  return (
    <Dialog open={!!project} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="tracker-dialog">
        <DialogHeader>
          <DialogTitle>
            {project?.bid_reference} · {project?.project_name}
          </DialogTitle>
        </DialogHeader>
        <div className="tracker-meta">
          <span>
            <small>Customer</small>
            <b>{project?.customer_name}</b>
          </span>
          <span>
            <small>Owner</small>
            <b>{project?.owner || "Unassigned"}</b>
          </span>
          <span>
            <small>Opportunity</small>
            <b>{money(project?.opportunity_value || 0)}</b>
          </span>
          <span>
            <small>Bid status</small>
            <b>{project?.bid_status}</b>
          </span>
        </div>
        <div className="sop-timeline">
          {stages.map((s) => (
            <article
              key={s.id}
              className={`${s.status.toLowerCase().replaceAll(" ", "-")} ${s.due_date && s.due_date < today() && !["Completed", "Skipped"].includes(s.status) ? "late" : ""}`}
            >
              <div className="stage-number">{s.stage.sequence_no}</div>
              <div>
                <h3>{s.stage.stage_name}</h3>
                <p>
                  {s.stage.accountable_group} · {s.stage.control_type} control
                </p>
                <small>
                  {s.stage.target_days
                    ? `${s.stage.target_days}-day target · `
                    : ""}
                  {s.stage.timing_anchor}
                </small>
              </div>
              <div className="stage-dates">
                <span>
                  Due <b>{s.due_date || "—"}</b>
                </span>
                <span>
                  Completed <b>{s.completed_date || "—"}</b>
                </span>
              </div>
              <div>
                <span
                  className={`status ${s.status.toLowerCase().replaceAll(" ", "-")}`}
                >
                  {s.status}
                </span>
                {[7, 10, 11].includes(s.stage.sequence_no) &&
                  s.outcome &&
                  s.outcome !== "Pending" && (
                    <small
                      className={`outcome ${s.outcome.toLowerCase().replaceAll(" ", "-")}`}
                    >
                      {s.outcome}
                    </small>
                  )}
                {s.documents_complete && (
                  <small className="docs-ok">Documents ✓</small>
                )}
              </div>
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => onEdit(s)}>
                  Update
                </Button>
              )}
            </article>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StageDialog({
  item,
  attachments,
  onClose,
  onSave,
  onFilesChanged,
}: {
  item: Stage | null;
  attachments: Attachment[];
  onClose: () => void;
  onSave: (s: Stage) => void;
  onFilesChanged: () => void;
}) {
  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      {item && (
        <StageForm
          key={item.id}
          item={item}
          attachments={attachments}
          onClose={onClose}
          onSave={onSave}
          onFilesChanged={onFilesChanged}
        />
      )}
    </Dialog>
  );
}
function StageForm({
  item,
  attachments,
  onClose,
  onSave,
  onFilesChanged,
}: {
  item: Stage;
  attachments: Attachment[];
  onClose: () => void;
  onSave: (s: Stage) => void;
  onFilesChanged: () => void;
}) {
  const [v, setV] = useState<Stage>(() => ({
      ...item,
      outcome: item.outcome || "Pending",
    })),
    [uploading, setUploading] = useState(false);
  const field = (key: keyof Stage, value: unknown) =>
    setV((current) => ({ ...current, [key]: value }));
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const form = new FormData();
    form.set("history_id", String(item.id));
    Array.from(files).forEach((file) => form.append("files", file));
    const res = await fetch("/api/presales/attachments", {
        method: "POST",
        body: form,
      }),
      json = await res.json();
    setUploading(false);
    if (!res.ok) return toast.error(json.error || "Upload failed");
    toast.success(
      `${json.uploaded} attachment${json.uploaded === 1 ? "" : "s"} uploaded`,
    );
    if (json.errors?.length) toast.warning(json.errors.join("; "));
    onFilesChanged();
  }
  async function remove(id: number) {
    const res = await fetch(`/api/presales/attachments?id=${id}`, {
        method: "DELETE",
      }),
      json = await res.json();
    if (!res.ok)
      return toast.error(json.error || "Could not delete attachment");
    toast.success("Attachment deleted");
    onFilesChanged();
  }
  return (
    <DialogContent className="presales-dialog">
      <DialogHeader>
        <DialogTitle>
          Stage {v.stage.sequence_no}: {v.stage.stage_name}
        </DialogTitle>
      </DialogHeader>
      <div className="stage-guidance">
        <b>Required documents</b>
        <span>{v.stage.required_documents || "No fixed checklist"}</span>
        <small>Timing starts when: {v.stage.timing_anchor}</small>
      </div>
      <div className="form-grid">
        <label>
          Status
          <Select value={v.status} onValueChange={(x) => field("status", x)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                "Not Started",
                "In Progress",
                "Completed",
                "Blocked",
                "Skipped",
              ].map((x) => (
                <SelectItem key={x} value={x}>
                  {x}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {[7, 10, 11].includes(v.stage.sequence_no) && (
          <label>
            Outcome
            <Select
              value={v.outcome}
              onValueChange={(x) => field("outcome", x)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Pending", "Passed", "Failed", "Not Applicable"].map((x) => (
                  <SelectItem key={x} value={x}>
                    {x}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <small className="outcome-help">
              Failed marks the overall bid Lost and skips all remaining stages.
            </small>
          </label>
        )}
        <label>
          Assigned to
          <Input
            value={v.assigned_to}
            onChange={(e) => field("assigned_to", e.target.value)}
          />
        </label>
        <label>
          Planned start
          <Input
            type="date"
            value={v.planned_start || ""}
            onChange={(e) => field("planned_start", e.target.value || null)}
          />
        </label>
        <label>
          Due date
          <Input
            type="date"
            value={v.due_date || ""}
            onChange={(e) => field("due_date", e.target.value || null)}
          />
        </label>
        <label>
          Actual start
          <Input
            type="date"
            value={v.actual_start || ""}
            onChange={(e) => field("actual_start", e.target.value || null)}
          />
        </label>
        <label>
          Completed date
          <Input
            type="date"
            value={v.completed_date || ""}
            onChange={(e) => field("completed_date", e.target.value || null)}
          />
        </label>
        <label className="checkbox wide">
          <input
            type="checkbox"
            checked={v.documents_complete}
            onChange={(e) => field("documents_complete", e.target.checked)}
          />{" "}
          Required documents completed
        </label>
        <label className="wide">
          Notes / history entry
          <textarea
            value={v.notes}
            onChange={(e) => field("notes", e.target.value)}
          />
        </label>
      </div>
      <section className="attachment-box">
        <div className="attachment-heading">
          <div>
            <b>
              <Paperclip /> Attachments
            </b>
            <small>
              PDF, images, Office files, text or CSV · maximum 15 MB each
            </small>
          </div>
          <label className="attachment-upload">
            {uploading ? <Loader2 className="spin" /> : <Plus />}
            {uploading ? "Uploading…" : "Add multiple files"}
            <input
              type="file"
              multiple
              disabled={uploading}
              onChange={(e) => upload(e.target.files)}
            />
          </label>
        </div>
        <div className="attachment-list">
          {attachments.map((a) => (
            <article key={a.id}>
              <Paperclip />
              <a href={a.download_url} target="_blank" rel="noreferrer">
                {a.file_name}
              </a>
              <span>
                {(a.file_size / 1024 / 1024).toFixed(2)} MB ·{" "}
                {a.uploaded_by_email || "User"}
              </span>
              <button
                type="button"
                aria-label={`Delete ${a.file_name}`}
                onClick={() => remove(a.id)}
              >
                <Trash2 />
              </button>
            </article>
          ))}
          {!attachments.length && <p>No attachments yet.</p>}
        </div>
      </section>
      <div className="dialog-actions">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSave(v)}>Save stage</Button>
      </div>
    </DialogContent>
  );
}
