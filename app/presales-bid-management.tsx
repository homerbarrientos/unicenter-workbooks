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
  reconsideration_reason: string;
  filing_date: string | null;
  resolution_date: string | null;
  performance_bond_received_date: string | null;
  ntp_received_date: string | null;
  po_acknowledged_date: string | null;
  completed_check_ids?: number[];
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
type DocumentRequirement = {
  id: number;
  stage_id: number;
  document_name: string;
  required: boolean;
  sequence_no: number;
};
type DocumentCheck = {
  id: number;
  history_id: number;
  requirement_id: number;
  completed: boolean;
};
type Payload = {
  role: string;
  templates: Template[];
  projects: Project[];
  history: Stage[];
  attachments: Attachment[];
  document_requirements: DocumentRequirement[];
  document_checks: DocumentCheck[];
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
      internal = history.filter((h) => h.stage.control_type !== "Client"),
      completed = internal.filter((h) => h.status === "Completed"),
      onTime = completed.filter(
        (h) =>
          !h.due_date || (!!h.completed_date && h.completed_date <= h.due_date),
      ),
      overdue = internal.filter(
        (h) =>
          ["In Progress", "Blocked"].includes(h.status) &&
          !!h.due_date &&
          h.due_date < today(),
      ),
      clientWaiting = history.filter(
        (h) =>
          h.stage.control_type === "Client" &&
          ["In Progress", "Blocked"].includes(h.status),
      );
    return {
      active: active.length,
      pipeline: active.reduce((s, p) => s + Number(p.opportunity_value), 0),
      winRate: decided.length
        ? (projects.filter((p) => p.bid_status === "Won").length /
            decided.length) *
          100
        : 0,
      onTime: completed.length ? (onTime.length / completed.length) * 100 : 0,
      overdue: overdue.length,
      clientWaiting: clientWaiting.length,
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
          <span>Internal on-time</span>
          <b>{stats.onTime.toFixed(0)}%</b>
        </article>
        <article className={stats.overdue ? "danger" : ""}>
          <AlertTriangle />
          <span>Internal overdue</span>
          <b>{stats.overdue}</b>
        </article>
        <article>
          <span>Client waiting</span>
          <b>{stats.clientWaiting}</b>
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
        requirements={(data.document_requirements || []).filter(
          (r) => r.stage_id === stageEdit?.stage_id,
        )}
        checks={(data.document_checks || []).filter(
          (c) => c.history_id === stageEdit?.id,
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
      <form
        id="presales-project-form"
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(v);
        }}
      >
        <label>
          <span>Bid reference <b className="required-mark">*</b></span>
          <Input
            value={v.bid_reference}
            onChange={(e) => field("bid_reference", e.target.value)}
            placeholder="BID-2026-001"
            required
          />
        </label>
        <label>
          <span>Customer <b className="required-mark">*</b></span>
          <Input
            value={v.customer_name}
            onChange={(e) => field("customer_name", e.target.value)}
            required
          />
        </label>
        <label className="wide">
          <span>Project name <b className="required-mark">*</b></span>
          <Input
            value={v.project_name}
            onChange={(e) => field("project_name", e.target.value)}
            required
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
          <span>Start date <b className="required-mark">*</b></span>
          <Input
            type="date"
            value={v.start_date}
            onChange={(e) => field("start_date", e.target.value)}
            required
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
      </form>
      <div className="dialog-actions">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="presales-project-form">Save bid</Button>
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
  requirements,
  checks,
  onClose,
  onSave,
  onFilesChanged,
}: {
  item: Stage | null;
  attachments: Attachment[];
  requirements: DocumentRequirement[];
  checks: DocumentCheck[];
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
          requirements={requirements}
          checks={checks}
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
  requirements,
  checks,
  onClose,
  onSave,
  onFilesChanged,
}: {
  item: Stage;
  attachments: Attachment[];
  requirements: DocumentRequirement[];
  checks: DocumentCheck[];
  onClose: () => void;
  onSave: (s: Stage) => void;
  onFilesChanged: () => void;
}) {
  const [v, setV] = useState<Stage>(() => ({
      ...item,
      outcome: item.outcome || "Pending",
      completed_check_ids: checks.filter((c) => c.completed).map((c) => c.id),
    })),
    [uploading, setUploading] = useState(false);
  const field = (key: keyof Stage, value: unknown) =>
    setV((current) => ({ ...current, [key]: value }));
  const updateStatus = (status: string) =>
    setV((current) => ({
      ...current,
      status,
      outcome: status === "Completed" ? current.outcome || "Pending" : "Pending",
      completed_date:
        status === "Completed" ? current.completed_date : null,
    }));
  const toggleCheck = (checkId: number, completed: boolean) =>
    setV((current) => ({
      ...current,
      completed_check_ids: completed
        ? [...new Set([...(current.completed_check_ids || []), checkId])]
        : (current.completed_check_ids || []).filter((id) => id !== checkId),
    }));
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
          <Select value={v.status} onValueChange={updateStatus}>
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
              disabled={v.status !== "Completed"}
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
              {v.status === "Completed"
                ? "Failed marks the overall bid Lost and skips all remaining stages."
                : "Set the stage to Completed before selecting its outcome."}
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
        {v.stage.sequence_no === 7 && (
          <>
            <label className="wide">
              Reconsideration reason
              <textarea
                value={v.reconsideration_reason || ""}
                onChange={(e) => field("reconsideration_reason", e.target.value)}
              />
            </label>
            <label>
              Filing date
              <Input type="date" value={v.filing_date || ""} onChange={(e) => field("filing_date", e.target.value || null)} />
            </label>
            <label>
              Resolution date
              <Input type="date" value={v.resolution_date || ""} onChange={(e) => field("resolution_date", e.target.value || null)} />
            </label>
          </>
        )}
        {[
          [15, "performance_bond_received_date", "Performance bond received"],
          [19, "ntp_received_date", "NTP received"],
          [20, "po_acknowledged_date", "PO acknowledged"],
        ].filter(([sequence]) => sequence === v.stage.sequence_no).map(([, key, label]) => (
          <label key={String(key)}>
            {label}
            <Input type="date" value={String(v[key as keyof Stage] || "")} onChange={(e) => field(key as keyof Stage, e.target.value || null)} />
          </label>
        ))}
        <label className="wide">
          Notes / history entry
          <textarea
            value={v.notes}
            onChange={(e) => field("notes", e.target.value)}
          />
        </label>
      </div>
      <section className="document-checklist">
        <div>
          <b>Document checklist</b>
          <small>Every required item must be checked before this stage can be completed.</small>
        </div>
        {requirements.map((requirement) => {
          const check = checks.find((c) => c.requirement_id === requirement.id);
          return (
            <label key={requirement.id}>
              <input
                type="checkbox"
                checked={!!check && (v.completed_check_ids || []).includes(check.id)}
                disabled={!check}
                onChange={(e) => check && toggleCheck(check.id, e.target.checked)}
              />
              <span>{requirement.document_name}</span>
              {requirement.required && <small>Required</small>}
            </label>
          );
        })}
        {!requirements.length && <p>No document requirements configured.</p>}
      </section>
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
