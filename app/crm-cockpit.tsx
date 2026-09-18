"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  MessageSquareText,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const crmLifecycle = [
  "Lead",
  "Discovery",
  "Scoping",
  "Proposal",
  "TOR incubation",
  "Bidding",
  "Awarded",
  "Mobilization",
  "Procurement",
  "Delivery",
  "Acceptance",
  "Billing",
  "Collection",
  "Post-Sales",
] as const;
export type Lifecycle = (typeof crmLifecycle)[number];
export type LifecycleSummaryItem = { stage: Lifecycle; opportunityValue: number };
type Tab = "milestones" | "materials" | "ar" | "interactions" | "brief";
type StageTemplate = { stage_name?: string; sequence_no?: number; accountable_group?: string; control_type?: string };
type Project = {
  id: number;
  customer_name: string;
  project_name: string;
  opportunity_value?: number;
  owner?: string;
  priority?: string;
  bid_status?: string;
  probability?: number;
  project_type?: string;
  business_model?: string;
  primary_contact?: string;
  contact_role?: string;
  next_action?: string;
  next_action_date?: string | null;
  opportunity_summary?: string;
  remarks?: string;
  current_stage?: StageTemplate | StageTemplate[] | null;
};
type History = { id: number; project_id: number; status: string; assigned_to?: string; due_date?: string | null; stage?: StageTemplate | null };
type Receivable = { id: number; customer_name: string; project_name?: string; billing_amount?: number; amount_collected?: number; status?: string; invoice_number?: string; billing_submission_date?: string | null; due_date?: string | null };
type Interaction = { id: number; project_id: number; interaction_type: string; interaction_date: string; notes: string; created_by_email?: string };
type MaterialRequest = { id: number; project_id: number; request_no: string; status: string; needed_by?: string | null };
type MaterialRequestItem = { id: number; request_id: number; description: string; quantity_required: number; quantity_reserved: number; quantity_released: number; procurement_status: string; item?: { sku?: string; item_name?: string; unit?: string } | null };
type ProcurementOrder = { id: number; material_request_id: number; po_number: string; supplier: string; status: string; expected_delivery?: string | null };
type CockpitData = {
  role: string;
  projects: Project[];
  templates: StageTemplate[];
  history: History[];
  receivables: Receivable[];
  interactions: Interaction[];
  materialRequests: MaterialRequest[];
  materialRequestItems: MaterialRequestItem[];
  procurementOrders: ProcurementOrder[];
  crmMigrationPending?: boolean;
  inventorySetupPending?: boolean;
};

function money(value: number, compact = false) {
  if (compact && Math.abs(value) >= 1_000_000) {
    return `₱${(value / 1_000_000).toFixed(Math.abs(value) >= 100_000_000 ? 0 : 1)}M`;
  }
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function quantity(value: number) {
  return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "UC";
}

function normal(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function currentStage(project: Project) {
  const relation = project.current_stage;
  return Array.isArray(relation) ? relation[0] : relation;
}

function lifecycleStage(project: Project, ar: Receivable[]): Lifecycle {
  const matchingAr = ar.filter((row) =>
    normal(row.customer_name) === normal(project.customer_name) ||
    (normal(row.project_name) && normal(row.project_name) === normal(project.project_name)),
  );
  if (matchingAr.length) {
    const outstanding = matchingAr.reduce(
      (sum, row) => sum + Math.max(0, Number(row.billing_amount || 0) - Number(row.amount_collected || 0)),
      0,
    );
    if (outstanding === 0 && matchingAr.every((row) => row.status === "Paid / Closed")) return "Post-Sales";
    if (matchingAr.some((row) => row.invoice_number || row.billing_submission_date)) return "Collection";
    return "Billing";
  }
  if (project.bid_status === "Won") return "Awarded";
  const sequence = Number(currentStage(project)?.sequence_no || 1);
  if (sequence <= 1) return "Lead";
  if (sequence === 2) return "Scoping";
  if (sequence <= 4) return "Proposal";
  if (sequence === 5) return "TOR incubation";
  if (sequence <= 11) return "Bidding";
  if (sequence <= 18) return "Awarded";
  if (sequence <= 20) return "Mobilization";
  if (sequence === 21) return "Procurement";
  if (sequence <= 23) return "Delivery";
  return "Acceptance";
}

function displayStatus(project: Project) {
  if (project.bid_status === "Won") return "Won";
  if (project.bid_status === "On Hold") return "Waiting";
  if (["Critical", "High"].includes(project.priority || "")) return "Priority";
  return "On track";
}

export default function CRMCockpit({
  onNavigate,
  stageFilter,
  onStageFilterChange,
  onLifecycleUpdate,
}: {
  onNavigate: (page: string) => void;
  stageFilter: Lifecycle | "All";
  onStageFilterChange: (stage: Lifecycle | "All") => void;
  onLifecycleUpdate: (items: LifecycleSummaryItem[]) => void;
}) {
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("milestones");
  const [opportunityOpen, setOpportunityOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/crm", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load Cockpit One.");
      setData(payload);
      onLifecycleUpdate((payload.projects || []).map((project: Project) => ({
        stage: lifecycleStage(project, payload.receivables || []),
        opportunityValue: Number(project.opportunity_value || 0),
      })));
      setSelectedId((current) => current && payload.projects.some((p: Project) => p.id === current) ? current : payload.projects[0]?.id ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load Cockpit One.");
    } finally {
      setLoading(false);
    }
  }, [onLifecycleUpdate]);

  // The initial request hydrates this client workspace from Supabase.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const opportunities = useMemo(() => (data?.projects || []).map((project) => ({
    ...project,
    lifecycle: lifecycleStage(project, data?.receivables || []),
    cockpitStatus: displayStatus(project),
  })), [data]);
  const filtered = opportunities.filter((item) => {
    const term = query.trim().toLowerCase();
    return (stageFilter === "All" || item.lifecycle === stageFilter) && (!term || `${item.customer_name} ${item.project_name} ${item.owner}`.toLowerCase().includes(term));
  });
  const selected = filtered.find((item) => item.id === selectedId) || filtered[0] || opportunities[0];
  const selectedHistory = (data?.history || [])
    .filter((row) => row.project_id === selected?.id)
    .sort((a, b) => Number(a.stage?.sequence_no || 0) - Number(b.stage?.sequence_no || 0));
  const selectedAr = (data?.receivables || []).filter((row) => selected && (
    normal(row.customer_name) === normal(selected.customer_name) ||
    (normal(row.project_name) && normal(row.project_name) === normal(selected.project_name))
  ));
  const selectedInteractions = (data?.interactions || []).filter((row) => row.project_id === selected?.id);
  const selectedMaterialRequests = (data?.materialRequests || []).filter((row) => row.project_id === selected?.id);
  const selectedMaterialRequestIds = new Set(selectedMaterialRequests.map((row) => row.id));
  const selectedMaterialItems = (data?.materialRequestItems || []).filter((row) => selectedMaterialRequestIds.has(row.request_id));
  const selectedProcurementOrders = (data?.procurementOrders || []).filter((row) => selectedMaterialRequestIds.has(row.material_request_id));
  const materialRequired = selectedMaterialItems.reduce((sum, row) => sum + Number(row.quantity_required || 0), 0);
  const materialReady = selectedMaterialItems.reduce((sum, row) => sum + Number(row.quantity_reserved || 0), 0);
  const materialReadiness = materialRequired ? Math.round(materialReady / materialRequired * 100) : 0;
  const totalPipeline = opportunities.filter((item) => !["Lost", "Cancelled"].includes(item.bid_status || "")).reduce((sum, item) => sum + Number(item.opportunity_value || 0), 0);
  const weightedPipeline = opportunities.reduce((sum, item) => sum + Number(item.opportunity_value || 0) * Number(item.probability || (item.bid_status === "Won" ? 100 : 20)) / 100, 0);
  const totalBilled = (data?.receivables || []).reduce((sum, row) => sum + Number(row.billing_amount || 0), 0);
  const totalOutstanding = (data?.receivables || []).reduce((sum, row) => sum + Math.max(0, Number(row.billing_amount || 0) - Number(row.amount_collected || 0)), 0);
  const canEdit = data?.role !== "Viewer" && !data?.crmMigrationPending;

  async function submit(action: string, value: Record<string, unknown>) {
    setSaving(true);
    try {
      const response = await fetch("/api/crm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, value }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save changes.");
      setData(payload);
      onLifecycleUpdate((payload.projects || []).map((project: Project) => ({
        stage: lifecycleStage(project, payload.receivables || []),
        opportunityValue: Number(project.opportunity_value || 0),
      })));
      return true;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not save changes.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function createOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = Object.fromEntries(form.entries());
    if (await submit("opportunity", value)) {
      setOpportunityOpen(false);
      toast.success("Opportunity added to the shared Pre-Sales pipeline.");
    }
  }

  async function logInteraction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const value = { ...Object.fromEntries(form.entries()), project_id: selected.id };
    if (await submit("interaction", value)) {
      setInteractionOpen(false);
      setTab("interactions");
      toast.success("Interaction saved.");
    }
  }

  if (loading) return <div className="cockpit-loading"><RefreshCw className="spin" /><p>Opening Cockpit One…</p></div>;
  if (error) return <div className="cockpit-loading cockpit-error"><p>{error}</p><Button onClick={load}>Try again</Button></div>;

  const kpis = [
    ["Total pipeline", money(totalPipeline, true), `${opportunities.length} opportunities`, TrendingUp],
    ["In bidding", opportunities.filter((x) => x.lifecycle === "Bidding").length, "Active bids", BriefcaseBusiness],
    ["Awarded", opportunities.filter((x) => x.lifecycle === "Awarded" || x.bid_status === "Won").length, "Won / awarded", ShieldCheck],
    ["Open projects", opportunities.filter((x) => x.bid_status === "Active").length, "Active records", Activity],
    ["SOP completed", data?.history.filter((x) => x.status === "Completed").length || 0, "Milestones", ClipboardCheck],
    ["Projects billed", data?.receivables.length || 0, money(totalBilled, true), CircleDollarSign],
    ["For collection", money(totalOutstanding, true), "Outstanding AR", CalendarClock],
  ] as const;

  return (
    <section className="cockpit">
      <div className="cockpit-topbar">
        <div><p>UNIFIED CUSTOMER LIFECYCLE</p><h1>COCKPIT ONE</h1></div>
        <div className="cockpit-top-actions"><span className="live-dot" />Live Supabase data<Button size="sm" onClick={() => void load()} variant="outline"><RefreshCw />Refresh</Button></div>
      </div>

      {data?.crmMigrationPending && (
        <div className="cockpit-notice"><Sparkles />Cockpit data is live. Apply migration 014 to enable CRM notes and customer interactions.</div>
      )}
      {data?.inventorySetupPending && (
        <div className="cockpit-notice"><PackageSearch />Apply migration 015 to activate project inventory and procurement.</div>
      )}

      <div className="cockpit-kpis">
        {kpis.map(([label, value, meta, Icon]) => (
          <article key={label}><div><Icon /><ArrowUpRight /></div><strong>{value}</strong><b>{label}</b><small>{meta}</small></article>
        ))}
      </div>

      <div className="cockpit-grid">
        <section className="pipeline-panel">
          <div className="panel-head"><div><small>PIPELINE</small><b>{filtered.length} customer records</b></div>{canEdit && <Button size="sm" onClick={() => setOpportunityOpen(true)}><Plus />Add</Button>}</div>
          <div className="cockpit-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer or project" /></div>
          <Select value={stageFilter} onValueChange={(value) => onStageFilterChange(value as Lifecycle | "All")}>
            <SelectTrigger className="cockpit-filter"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="All">All lifecycle stages</SelectItem>{crmLifecycle.map((stage) => <SelectItem key={stage} value={stage}>{stage}</SelectItem>)}</SelectContent>
          </Select>
          <div className="pipeline-list">
            {filtered.map((item) => (
              <button key={item.id} className={item.id === selected?.id ? "selected" : ""} onClick={() => { setSelectedId(item.id); setTab("milestones"); }}>
                <span className="customer-avatar">{initials(item.customer_name)}</span>
                <span className="pipeline-copy"><span><b>{item.customer_name}</b><i className={`status-${normal(item.cockpitStatus).replace(/\s/g, "-")}`}>{item.cockpitStatus}</i></span><em>{item.project_name}</em><small>{item.lifecycle} · {money(Number(item.opportunity_value || 0), true)}</small></span>
              </button>
            ))}
            {!filtered.length && <p className="empty-list">No records match this filter.</p>}
          </div>
        </section>

        <section className="opportunity-panel">
          {!selected ? (
            <div className="cockpit-empty"><BriefcaseBusiness /><h2>No opportunities yet</h2><p>Add the first opportunity to start the shared lifecycle.</p>{canEdit && <Button onClick={() => setOpportunityOpen(true)}><Plus />Add opportunity</Button>}</div>
          ) : (
            <>
              <div className="opportunity-head">
                <div className="opportunity-title"><span className="customer-avatar large">{initials(selected.customer_name)}</span><div><span><h2>{selected.customer_name}</h2><i className={`status-${normal(selected.cockpitStatus).replace(/\s/g, "-")}`}>{selected.cockpitStatus}</i></span><p>{selected.project_name}</p></div></div>
                <div className="opportunity-actions">{canEdit && <Button size="sm" variant="outline" onClick={() => setInteractionOpen(true)} disabled={data?.crmMigrationPending}><MessageSquareText />Log interaction</Button>}<Button size="sm" onClick={() => onNavigate("presales")}>Open SOP workflow<ChevronRight /></Button></div>
                <div className="lifecycle-track">
                  {crmLifecycle.map((stage, index) => {
                    const active = stage === selected.lifecycle;
                    const complete = index < crmLifecycle.indexOf(selected.lifecycle);
                    return <div key={stage} className={active ? "active" : complete ? "complete" : ""}><span>{index + 1}</span><small>{stage}</small></div>;
                  })}
                </div>
              </div>

              <div className="opportunity-body">
                <div className="opportunity-main">
                  <div className="next-commitment"><Clock3 /><div><small>NEXT COMMITMENT</small><b>{selected.next_action || currentStage(selected)?.stage_name || "Update the next customer commitment"}</b><p>{selected.next_action_date ? `Due ${selected.next_action_date}` : "No committed date"} · Owner: {selected.owner || "Unassigned"}</p></div></div>
                  <div className="cockpit-tabs">
                    {(["milestones", "materials", "ar", "interactions", "brief"] as Tab[]).map((value) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{value === "ar" ? "Billing & AR" : value[0].toUpperCase() + value.slice(1)}</button>)}
                  </div>

                  {tab === "milestones" && <div className="milestone-list">{selectedHistory.map((row) => <article key={row.id}><span className={normal(row.status).replace(/\s/g, "-")} /> <div><b>{row.stage?.stage_name}</b><small>{row.stage?.accountable_group} · {row.stage?.control_type}</small></div><i>{row.status}</i></article>)}{!selectedHistory.length && <p className="tab-empty">No SOP milestones found.</p>}</div>}
                  {tab === "materials" && <div className="material-readiness"><div className="material-readiness-summary"><div><small>PROJECT MATERIAL READINESS</small><b>{materialReadiness}%</b><p>{quantity(materialReady)} of {quantity(materialRequired)} units reserved or ready</p></div><div className="material-progress"><span style={{ width: `${materialReadiness}%` }} /></div></div>{selectedMaterialRequests.map((request) => <article key={request.id}><div><b>{request.request_no}</b><small>{request.status} · Needed {request.needed_by || "not set"}</small></div><span>{selectedMaterialItems.filter((item) => item.request_id === request.id && Number(item.quantity_required) > Number(item.quantity_reserved)).length} shortages</span></article>)}{!selectedMaterialRequests.length ? <div className="tab-empty"><PackageSearch /><p>No project material request has been created.</p></div> : null}<Button size="sm" variant="outline" onClick={() => onNavigate("procurement")}>Open Inventory & Procurement<ChevronRight /></Button></div>}
                  {tab === "ar" && <div className="ar-link-list">{selectedAr.map((row) => <article key={row.id}><div><small>{row.invoice_number || "Billing record"}</small><b>{money(Number(row.billing_amount || 0))}</b><p>{row.status} · Due {row.due_date || "not set"}</p></div><div><small>Outstanding</small><strong>{money(Math.max(0, Number(row.billing_amount || 0) - Number(row.amount_collected || 0)))}</strong></div></article>)}{!selectedAr.length && <div className="tab-empty"><CircleDollarSign /><p>No AR record is linked by customer or project name.</p><Button size="sm" variant="outline" onClick={() => onNavigate("ar-monitor")}>Open AR Monitor</Button></div>}</div>}
                  {tab === "interactions" && <div className="interaction-list">{selectedInteractions.map((row) => <article key={row.id}><div><b>{row.interaction_type}</b><small>{row.interaction_date}</small></div><p>{row.notes}</p><small>Logged by {row.created_by_email || "Unicenter team"}</small></article>)}{!selectedInteractions.length && <p className="tab-empty">No customer interactions logged yet.</p>}</div>}
                  {tab === "brief" && <div className="brief-card"><small>CUSTOMER OUTCOME</small><p>{selected.opportunity_summary || selected.remarks || "No opportunity brief has been added."}</p></div>}
                </div>

                <aside className="opportunity-side">
                  <article><small>OPPORTUNITY</small><strong>{money(Number(selected.opportunity_value || 0), true)}</strong><div><span><small>Probability</small><b>{selected.probability || (selected.bid_status === "Won" ? 100 : 20)}%</b></span><span><small>Owner</small><b>{selected.owner || "Unassigned"}</b></span></div><p>{selected.project_type || "Project type not set"}</p><p>{selected.business_model || "Unicenter-Managed"}</p></article>
                  <article><small>PRIMARY CONTACT</small><div className="contact"><span className="customer-avatar">{initials(selected.primary_contact || selected.customer_name)}</span><div><b>{selected.primary_contact || "To be assigned"}</b><p>{selected.contact_role || "Customer contact"}</p></div></div></article>
                </aside>
              </div>
            </>
          )}
        </section>

        <aside className="cockpit-insights">
          <article><div><span><small>FORECAST</small><b>Weighted pipeline</b></span><TrendingUp /></div><strong>{money(weightedPipeline, true)}</strong><p>Probability-adjusted opportunity value</p><div className="forecast-bars"><i style={{ width: `${Math.min(100, totalPipeline ? weightedPipeline / totalPipeline * 100 : 0)}%` }} /></div></article>
          <article><div><span><small>CASH VISIBILITY</small><b>Accounts receivable</b></span><CircleDollarSign /></div><strong>{money(totalOutstanding, true)}</strong><p>{data?.receivables.filter((x) => x.status !== "Paid / Closed").length || 0} open collection records</p><Button size="sm" variant="outline" onClick={() => onNavigate("ar-monitor")}>Open AR Monitor<ChevronRight /></Button></article>
          <article className="accountability"><PackageSearch /><b>Material readiness</b><strong>{materialReadiness}%</strong><p>{selectedProcurementOrders.filter((order) => !["Received", "Cancelled"].includes(order.status)).length} open purchase orders for the selected project.</p><Button size="sm" variant="outline" onClick={() => onNavigate("procurement")}>Open project materials<ChevronRight /></Button></article>
        </aside>
      </div>

      <Dialog open={opportunityOpen} onOpenChange={setOpportunityOpen}>
        <DialogContent className="cockpit-dialog sm:max-w-2xl"><DialogHeader><DialogTitle>New opportunity</DialogTitle><DialogDescription>Creates one shared Pre-Sales record and its complete SOP workflow.</DialogDescription></DialogHeader>
          <form onSubmit={createOpportunity} className="cockpit-form"><label>Customer / agency<Input name="customer_name" required /></label><label>Project<Input name="project_name" required /></label><label>Potential value<Input name="opportunity_value" type="number" min="0" /></label><label>Owner<Input name="owner" /></label><label>Probability<Input name="probability" type="number" min="0" max="100" defaultValue="20" /></label><label>Project type<Input name="project_type" placeholder="Government – Total Solution" /></label><label>Primary contact<Input name="primary_contact" /></label><label>Contact role<Input name="contact_role" /></label><label>Next action<Input name="next_action" defaultValue="Schedule discovery meeting" /></label><label>Next action date<Input name="next_action_date" type="date" /></label><label className="wide">Opportunity brief<textarea name="opportunity_summary" rows={4} /></label><DialogFooter className="wide"><Button type="button" variant="outline" onClick={() => setOpportunityOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create opportunity"}</Button></DialogFooter></form>
        </DialogContent>
      </Dialog>

      <Dialog open={interactionOpen} onOpenChange={setInteractionOpen}>
        <DialogContent className="cockpit-dialog"><DialogHeader><DialogTitle>Log interaction</DialogTitle><DialogDescription>{selected?.customer_name} · {selected?.project_name}</DialogDescription></DialogHeader>
          <form onSubmit={logInteraction} className="cockpit-form one"><label>Interaction type<select name="interaction_type" defaultValue="Client meeting"><option>Client meeting</option><option>Site visit</option><option>Workshop</option><option>Call</option><option>Email</option><option>Other</option></select></label><label>Date<Input name="interaction_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><label>Next action<Input name="next_action" /></label><label>Next action date<Input name="next_action_date" type="date" /></label><label className="wide">What happened?<textarea name="notes" rows={5} required /></label><DialogFooter className="wide"><Button type="button" variant="outline" onClick={() => setInteractionOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save interaction"}</Button></DialogFooter></form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
