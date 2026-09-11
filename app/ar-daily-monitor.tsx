"use client";
/* eslint-disable react-hooks/preserve-manual-memoization, react-hooks/purity */
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Download,
  History,
  Plus,
  Printer,
  Search,
  WalletCards,
  type LucideIcon,
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
type AR = {
  id?: number;
  customer_name: string;
  project_name: string;
  contract_amount: number;
  billing_amount: number | null;
  billing_submission_date: string | null;
  invoice_number: string;
  invoice_date: string | null;
  due_date: string | null;
  amount_collected: number;
  closed_date: string | null;
  status: string;
  last_follow_up_date: string | null;
  next_follow_up_date: string | null;
  promise_to_pay_date: string | null;
  expected_collection_amount: number;
  priority: string;
  responsible_person: string;
  customer_contact: string;
  next_action: string;
  escalation_level: string;
  issues: string;
  updated_at?: string;
};
type Payment = {
  id: number;
  receivable_id: number;
  payment_date: string;
  amount: number;
  or_number: string | null;
  payment_method: string;
  reference_number: string;
  remarks: string;
  created_by_email: string;
  created_at: string;
};
type S = {
  label: string;
  items: number;
  outstanding: number;
  percent?: number;
};
const statuses = [
    "Submitted / Under Review",
    "For Correction",
    "Approved / For Processing",
    "For Check Preparation",
    "Check Ready",
    "Partially Paid",
    "Disputed",
    "On Hold",
    "Paid / Closed",
  ],
  buckets = ["0-30", "31-60", "61-90", "91-120", "121+"];
const filters = [
  "All",
  "Exceptions",
  "91+ Days",
  "Follow-up Overdue",
  "Promise Past Due",
  ...statuses,
];
const blank: AR = {
  customer_name: "",
  project_name: "",
  contract_amount: 0,
  billing_amount: null,
  billing_submission_date: null,
  invoice_number: "",
  invoice_date: null,
  due_date: null,
  amount_collected: 0,
  closed_date: null,
  status: statuses[0],
  last_follow_up_date: null,
  next_follow_up_date: null,
  promise_to_pay_date: null,
  expected_collection_amount: 0,
  priority: "Medium",
  responsible_person: "",
  customer_contact: "",
  next_action: "",
  escalation_level: "None",
  issues: "",
};
const day = 86400000,
  today = () => new Date().toISOString().slice(0, 10),
  money = (n: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(n || 0);
function calc(r: AR) {
  const billed = Number(r.billing_amount || 0),
    collected = Number(r.amount_collected || 0),
    outstanding = Math.max(0, billed - collected),
    end = r.closed_date ? new Date(r.closed_date + "T00:00:00") : new Date(),
    aging = r.billing_submission_date
      ? Math.max(
          0,
          Math.floor(
            (end.getTime() -
              new Date(r.billing_submission_date + "T00:00:00").getTime()) /
              day,
          ),
        )
      : null,
    bucket =
      aging == null
        ? "Unaged"
        : aging <= 30
          ? "0-30"
          : aging <= 60
            ? "31-60"
            : aging <= 90
              ? "61-90"
              : aging <= 120
                ? "91-120"
                : "121+";
  let check = "OK";
  if (!r.billing_submission_date) check = "Missing submission date";
  else if (r.billing_amount == null) check = "Missing billing amount";
  else if (collected > billed) check = "Collected exceeds billed";
  else if (r.status === "Paid / Closed" && outstanding > 0)
    check = "Paid status with balance";
  else if (
    r.status !== "Paid / Closed" &&
    outstanding > 0 &&
    !r.next_follow_up_date
  )
    check = "Missing next follow-up";
  else if (
    r.status !== "Paid / Closed" &&
    outstanding > 0 &&
    r.next_follow_up_date! < today()
  )
    check = "Follow-up overdue";
  return { outstanding, aging, bucket, check };
}
function match(r: AR, f: string) {
  const c = calc(r);
  if (f === "All") return true;
  if (f === "Exceptions") return c.check !== "OK";
  if (f === "91+ Days") return (c.aging || 0) > 90 && c.outstanding > 0;
  if (f === "Follow-up Overdue")
    return !!(
      r.next_follow_up_date &&
      r.next_follow_up_date < today() &&
      c.outstanding
    );
  if (f === "Promise Past Due")
    return !!(
      r.promise_to_pay_date &&
      r.promise_to_pay_date < today() &&
      c.outstanding
    );
  return r.status === f;
}
const quote = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
function exportCsv(rows: AR[], filter: string) {
  const headers = [
    "No.",
    "Customer Name",
    "Project Name",
    "Contract Amount",
    "Billing Amount",
    "Billing Submission Date",
    "Invoice / Bill No.",
    "Invoice / Bill Date",
    "Due Date",
    "Aging Days",
    "Aging Bucket",
    "Amount Collected",
    "Outstanding Balance",
    "Closed / Completed Date",
    "Status",
    "Last Follow-up Date",
    "Next Follow-up Date",
    "Promise-to-Pay Date",
    "Expected Collection Amount",
    "Priority",
    "Responsible Person",
    "Customer Contact / Office",
    "Next Action",
    "Escalation Level",
    "Issues",
    "Last Updated",
    "Data Check",
  ];
  const data = rows.map((r, i) => {
    const c = calc(r);
    return [
      i + 1,
      r.customer_name,
      r.project_name,
      r.contract_amount,
      r.billing_amount,
      r.billing_submission_date,
      r.invoice_number,
      r.invoice_date,
      r.due_date,
      c.aging,
      c.bucket,
      r.amount_collected,
      c.outstanding,
      r.closed_date,
      r.status,
      r.last_follow_up_date,
      r.next_follow_up_date,
      r.promise_to_pay_date,
      r.expected_collection_amount,
      r.priority,
      r.responsible_person,
      r.customer_contact,
      r.next_action,
      r.escalation_level,
      r.issues,
      r.updated_at,
      c.check,
    ]
      .map(quote)
      .join(",");
  });
  const blob = new Blob(
      ["\ufeff" + [headers.map(quote).join(","), ...data].join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `UNICENTER_AR_${filter.replaceAll(" ", "_")}_${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
export default function ARDailyMonitor() {
  const [data, setData] = useState<{
      role: string;
      records: AR[];
      payments: Payment[];
    } | null>(null),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All"),
    [edit, setEdit] = useState<AR | null>(null),
    [ledger, setLedger] = useState<AR | null>(null);
  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/ar-monitor"),
        j = await r.json();
      if (!r.ok) setError(j.error || "Could not load AR monitor");
      else setData(j);
    })();
  }, []);
  const rows = useMemo(() => data?.records || [], [data]),
    visible = useMemo(
      () =>
        rows.filter(
          (r) =>
            match(r, filter) &&
            (
              r.customer_name +
              r.project_name +
              r.invoice_number +
              r.responsible_person +
              r.next_action
            )
              .toLowerCase()
              .includes(query.toLowerCase()),
        ),
      [rows, filter, query],
    );
  const totals = useMemo(() => {
    const billed = rows.reduce((s, r) => s + Number(r.billing_amount || 0), 0),
      collected = rows.reduce((s, r) => s + Number(r.amount_collected || 0), 0),
      outstanding = rows.reduce((s, r) => s + calc(r).outstanding, 0),
      limit = new Date(Date.now() + 7 * day).toISOString().slice(0, 10),
      next7 = rows
        .filter(
          (r) =>
            r.promise_to_pay_date &&
            r.promise_to_pay_date >= today() &&
            r.promise_to_pay_date <= limit &&
            calc(r).outstanding > 0,
        )
        .reduce((s, r) => s + Number(r.expected_collection_amount || 0), 0);
    return {
      billed,
      collected,
      outstanding,
      next7,
      open: rows.filter((r) => calc(r).outstanding > 0).length,
      old: rows.filter(
        (r) => (calc(r).aging || 0) > 90 && calc(r).outstanding > 0,
      ).length,
      exceptions: rows.filter((r) => calc(r).check !== "OK").length,
    };
  }, [rows]);
  const aging = useMemo<S[]>(
      () =>
        buckets.map((label) => {
          const a = rows.filter(
              (r) => calc(r).bucket === label && calc(r).outstanding > 0,
            ),
            outstanding = a.reduce((s, r) => s + calc(r).outstanding, 0);
          return {
            label,
            items: a.length,
            outstanding,
            percent: totals.outstanding
              ? (outstanding / totals.outstanding) * 100
              : 0,
          };
        }),
      [rows, totals.outstanding],
    ),
    byStatus = useMemo<S[]>(
      () =>
        statuses
          .filter((x) => x !== "Paid / Closed")
          .map((label) => {
            const a = rows.filter(
              (r) => r.status === label && calc(r).outstanding > 0,
            );
            return {
              label,
              items: a.length,
              outstanding: a.reduce((s, r) => s + calc(r).outstanding, 0),
            };
          }),
      [rows],
    ),
    exceptions = useMemo<S[]>(
      () =>
        [
          "Follow-up overdue",
          "Payment promise past due",
          "Missing next follow-up",
          "Disputed / On Hold",
          "Data check issue",
        ].map((label) => {
          const a = rows.filter((r) =>
            label === "Follow-up overdue"
              ? !!(
                  r.next_follow_up_date &&
                  r.next_follow_up_date < today() &&
                  calc(r).outstanding
                )
              : label === "Payment promise past due"
                ? !!(
                    r.promise_to_pay_date &&
                    r.promise_to_pay_date < today() &&
                    calc(r).outstanding
                  )
                : label === "Missing next follow-up"
                  ? calc(r).check === "Missing next follow-up"
                  : label === "Disputed / On Hold"
                    ? ["Disputed", "On Hold"].includes(r.status) &&
                      calc(r).outstanding > 0
                    : calc(r).check !== "OK",
          );
          return {
            label,
            items: a.length,
            outstanding: a.reduce((s, r) => s + calc(r).outstanding, 0),
          };
        }),
      [rows],
    );
  async function save(value: AR) {
    const r = await fetch("/api/ar-monitor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value }),
      }),
      j = await r.json();
    if (!r.ok) return toast.error(j.error || "Could not save AR record");
    setData(j);
    setEdit(null);
    toast.success("AR record saved");
  }
  async function savePayment(
    value: Omit<Payment, "id" | "created_by_email" | "created_at">,
  ) {
    const r = await fetch("/api/ar-monitor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "payment", value }),
      }),
      j = await r.json();
    if (!r.ok) return toast.error(j.error || "Could not record payment");
    setData(j);
    const refreshed = (j.records || []).find(
      (x: AR) => x.id === value.receivable_id,
    );
    if (refreshed) setLedger(refreshed);
    toast.success("Payment recorded and balance updated");
  }
  if (error)
    return (
      <section className="workspace">
        <div className="empty">
          {error}. Run migration 004_ar_daily_monitor.sql in Supabase, then
          refresh.
        </div>
      </section>
    );
  if (!data)
    return (
      <section className="workspace">
        <div className="empty">Loading AR daily monitor…</div>
      </section>
    );
  return (
    <section className="workspace ar-workspace">
      <div className="ar-summary">
        <Metric
          label="Total billed"
          value={money(totals.billed)}
          icon={WalletCards}
        />
        <Metric
          label="Collected"
          value={money(totals.collected)}
          icon={WalletCards}
        />
        <Metric
          label="Outstanding"
          value={money(totals.outstanding)}
          icon={WalletCards}
        />
        <Metric
          label="Expected next 7 days"
          value={money(totals.next7)}
          icon={CalendarClock}
        />
        <Metric
          label="Open billings"
          value={String(totals.open)}
          icon={CalendarClock}
        />
        <Metric
          label="91+ day items"
          value={String(totals.old)}
          icon={AlertTriangle}
        />
      </div>
      <div className="ar-management">
        <Summary title="Outstanding by submission aging" rows={aging} percent />
        <Summary title="Open AR by status" rows={byStatus} />
        <Summary title="Daily exceptions" rows={exceptions} danger />
      </div>
      <div className="ar-exception">
        <AlertTriangle />
        <div>
          <b>{totals.exceptions} records need attention</b>
          <span>
            Missing follow-up, overdue follow-up, collection mismatch, or
            incomplete billing data.
          </span>
        </div>
        <Button variant="outline" onClick={() => setFilter("Exceptions")}>
          Review exceptions
        </Button>
      </div>
      <div className="toolbar ar-toolbar">
        <div className="search">
          <Search />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer, project, invoice, owner or action…"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {filters.map((x) => (
              <SelectItem key={x} value={x}>
                {x}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => exportCsv(visible, filter)}>
          <Download /> Export {filter === "All" ? "all" : "filtered"}
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer /> Print
        </Button>
        {data.role !== "Viewer" && (
          <Button onClick={() => setEdit({ ...blank })}>
            <Plus /> Add AR record
          </Button>
        )}
      </div>
      <div className="data-card ar-card">
        <table>
          <thead>
            <tr>
              <th>Customer / Project</th>
              <th>Invoice</th>
              <th>Billed</th>
              <th>Collected</th>
              <th>Outstanding</th>
              <th>Payment ledger</th>
              <th>Aging</th>
              <th>Status</th>
              <th>Follow-up / Promise</th>
              <th>Owner</th>
              <th>Next action</th>
              <th>Data check</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const c = calc(r);
              return (
                <tr
                  key={r.id}
                  onClick={() => data.role !== "Viewer" && setEdit(r)}
                >
                  <td>
                    <b>{r.customer_name}</b>
                    <span>{r.project_name || "No project supplied"}</span>
                  </td>
                  <td>
                    {r.invoice_number || "—"}
                    <small>{r.invoice_date || "No invoice date"}</small>
                  </td>
                  <td>{money(Number(r.billing_amount || 0))}</td>
                  <td>{money(r.amount_collected)}</td>
                  <td>
                    <b>{money(c.outstanding)}</b>
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLedger(r);
                      }}
                    >
                      <History /> View ledger
                    </Button>
                  </td>
                  <td>
                    {c.aging == null ? "—" : `${c.aging} days`}
                    <small>{c.bucket}</small>
                  </td>
                  <td>
                    <span
                      className={
                        "status " +
                        r.status
                          .toLowerCase()
                          .replaceAll(" ", "-")
                          .replaceAll("/", "")
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  <td>
                    {r.next_follow_up_date || "No follow-up"}
                    <small>
                      {r.promise_to_pay_date
                        ? `Promise: ${r.promise_to_pay_date}`
                        : "No payment promise"}
                    </small>
                  </td>
                  <td>
                    {r.responsible_person || "Unassigned"}
                    <small>{r.priority}</small>
                  </td>
                  <td>
                    {r.next_action || "—"}
                    <small>
                      {r.escalation_level !== "None"
                        ? `Escalate: ${r.escalation_level}`
                        : ""}
                    </small>
                  </td>
                  <td>
                    <span className={c.check === "OK" ? "ar-ok" : "ar-issue"}>
                      {c.check}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visible.length && (
          <div className="empty">No matching AR records.</div>
        )}
      </div>
      {edit && (
        <ARDialog item={edit} onClose={() => setEdit(null)} onSave={save} />
      )}
      {ledger && (
        <PaymentLedger
          item={ledger}
          payments={(data.payments || []).filter(
            (p) => p.receivable_id === ledger.id,
          )}
          role={data.role}
          onClose={() => setLedger(null)}
          onSave={savePayment}
        />
      )}
    </section>
  );
}
function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <article>
      <Icon />
      <span>{label}</span>
      <b>{value}</b>
    </article>
  );
}
function Summary({
  title,
  rows,
  percent = false,
  danger = false,
}: {
  title: string;
  rows: S[];
  percent?: boolean;
  danger?: boolean;
}) {
  return (
    <article className={danger ? "danger" : ""}>
      <h3>{title}</h3>
      <table>
        <thead>
          <tr>
            <th>
              {title.includes("aging")
                ? "Aging bucket"
                : title.includes("status")
                  ? "Status"
                  : "Exception"}
            </th>
            <th>Items</th>
            <th>Outstanding</th>
            {percent && <th>%</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td>{r.items}</td>
              <td>{money(r.outstanding)}</td>
              {percent && <td>{(r.percent || 0).toFixed(1)}%</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
function ARDialog({
  item,
  onClose,
  onSave,
}: {
  item: AR;
  onClose: () => void;
  onSave: (value: AR) => void;
}) {
  const [v, setV] = useState(item),
    set = <K extends keyof AR>(key: K, value: AR[K]) =>
      setV((s) => ({ ...s, [key]: value })),
    c = calc(v);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="record-dialog ar-dialog">
        <DialogHeader>
          <DialogTitle>{v.id ? "Update" : "Add"} AR record</DialogTitle>
        </DialogHeader>
        <div className="ar-computed">
          <span>
            Outstanding <b>{money(c.outstanding)}</b>
          </span>
          <span>
            Aging{" "}
            <b>
              {c.aging == null ? "Unaged" : `${c.aging} days · ${c.bucket}`}
            </b>
          </span>
          <span>
            Data check{" "}
            <b className={c.check === "OK" ? "ar-ok" : "ar-issue"}>{c.check}</b>
          </span>
        </div>
        <div className="form-grid">
          <Text
            label="Customer name"
            value={v.customer_name}
            onChange={(x) => set("customer_name", x)}
          />
          <Text
            label="Project name"
            value={v.project_name}
            onChange={(x) => set("project_name", x)}
          />
          <Num
            label="Contract amount"
            value={v.contract_amount}
            onChange={(x) => set("contract_amount", x || 0)}
          />
          <Num
            label="Billing amount"
            value={v.billing_amount}
            onChange={(x) => set("billing_amount", x)}
          />
          <Text
            label="Invoice / Bill no."
            value={v.invoice_number}
            onChange={(x) => set("invoice_number", x)}
          />
          <DateF
            label="Billing submission date"
            value={v.billing_submission_date}
            onChange={(x) => set("billing_submission_date", x)}
          />
          <DateF
            label="Invoice / Bill date"
            value={v.invoice_date}
            onChange={(x) => set("invoice_date", x)}
          />
          <DateF
            label="Due date"
            value={v.due_date}
            onChange={(x) => set("due_date", x)}
          />
          <label>
            Amount collected (from payment ledger)
            <Input value={money(v.amount_collected)} readOnly />
          </label>
          <DateF
            label="Closed / completed date"
            value={v.closed_date}
            onChange={(x) => set("closed_date", x)}
          />
          <Choice
            label="Status"
            value={v.status}
            options={statuses}
            onChange={(x) => set("status", x)}
          />
          <Choice
            label="Priority"
            value={v.priority}
            options={["Critical", "High", "Medium", "Low"]}
            onChange={(x) => set("priority", x)}
          />
          <DateF
            label="Last follow-up date"
            value={v.last_follow_up_date}
            onChange={(x) => set("last_follow_up_date", x)}
          />
          <DateF
            label="Next follow-up date"
            value={v.next_follow_up_date}
            onChange={(x) => set("next_follow_up_date", x)}
          />
          <DateF
            label="Promise-to-pay date"
            value={v.promise_to_pay_date}
            onChange={(x) => set("promise_to_pay_date", x)}
          />
          <Num
            label="Expected collection amount"
            value={v.expected_collection_amount}
            onChange={(x) => set("expected_collection_amount", x || 0)}
          />
          <Text
            label="Responsible person"
            value={v.responsible_person}
            onChange={(x) => set("responsible_person", x)}
          />
          <Text
            label="Customer contact / office"
            value={v.customer_contact}
            onChange={(x) => set("customer_contact", x)}
          />
          <Choice
            label="Escalation level"
            value={v.escalation_level}
            options={["None", "Supervisor", "Management", "Executive"]}
            onChange={(x) => set("escalation_level", x)}
          />
          <Text
            label="Next action"
            value={v.next_action}
            onChange={(x) => set("next_action", x)}
          />
          <label className="wide">
            Issues / detailed notes
            <textarea
              value={v.issues}
              onChange={(e) => set("issues", e.target.value)}
            />
          </label>
        </div>
        <div className="dialog-actions">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!v.customer_name.trim()} onClick={() => onSave(v)}>
            Save AR record
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function PaymentLedger({
  item,
  payments,
  role,
  onClose,
  onSave,
}: {
  item: AR;
  payments: Payment[];
  role: string;
  onClose: () => void;
  onSave: (
    value: Omit<Payment, "id" | "created_by_email" | "created_at">,
  ) => void;
}) {
  const [payment, setPayment] = useState({
      receivable_id: Number(item.id),
      payment_date: today(),
      amount: 0,
      or_number: "",
      payment_method: "Bank Transfer",
      reference_number: "",
      remarks: "",
    }),
    outstanding = calc(item).outstanding,
    set = (key: string, value: string | number) =>
      setPayment((s) => ({ ...s, [key]: value }));
  function exportPayments() {
    const headers = [
        "Payment Date",
        "OR Number",
        "Amount",
        "Method",
        "Reference Number",
        "Remarks",
        "Recorded By",
        "Recorded At",
      ],
      lines = payments.map((p) =>
        [
          p.payment_date,
          p.or_number || "",
          p.amount,
          p.payment_method,
          p.reference_number,
          p.remarks,
          p.created_by_email,
          p.created_at,
        ]
          .map(quote)
          .join(","),
      ),
      blob = new Blob(
        ["\ufeff" + [headers.map(quote).join(","), ...lines].join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `AR_PAYMENT_LEDGER_${item.invoice_number || item.id}_${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="payment-ledger-dialog">
        <DialogHeader>
          <DialogTitle>Payment ledger · {item.customer_name}</DialogTitle>
        </DialogHeader>
        <div className="ledger-reference">
          <span>Invoice <b>{item.invoice_number || "No invoice number"}</b></span>
          <span>Billed <b>{money(Number(item.billing_amount || 0))}</b></span>
          <span>Paid <b>{money(item.amount_collected)}</b></span>
          <span>Outstanding <b>{money(outstanding)}</b></span>
        </div>
        {role !== "Viewer" && outstanding > 0 && (
          <div className="payment-entry">
            <h3>Record payment</h3>
            <div className="form-grid">
              <DateF label="Payment date" value={payment.payment_date} onChange={(x) => set("payment_date", x || "")} />
              <Text label="OR number" value={payment.or_number} onChange={(x) => set("or_number", x)} />
              <Num label={`Amount (maximum ${money(outstanding)})`} value={payment.amount} onChange={(x) => set("amount", x || 0)} />
              <Choice label="Payment method" value={payment.payment_method} options={["Cash", "Check", "Bank Transfer", "GCash / Maya", "Other"]} onChange={(x) => set("payment_method", x)} />
              <Text label="Reference number" value={payment.reference_number} onChange={(x) => set("reference_number", x)} />
              <Text label="Remarks" value={payment.remarks} onChange={(x) => set("remarks", x)} />
            </div>
            <Button disabled={!payment.payment_date || !payment.or_number.trim() || payment.amount <= 0 || payment.amount > outstanding} onClick={() => onSave(payment)}>
              <Plus /> Record payment
            </Button>
            {payment.amount > outstanding && <p className="payment-error">Payment exceeds the outstanding collectible by {money(payment.amount - outstanding)}.</p>}
          </div>
        )}
        <div className="ledger-heading">
          <h3>Transaction history</h3>
          <Button size="sm" variant="outline" onClick={exportPayments}><Download /> Export ledger</Button>
        </div>
        <div className="ledger-table">
          <table>
            <thead><tr><th>Date</th><th>OR number</th><th>Amount</th><th>Method / Reference</th><th>Remarks</th><th>Recorded by</th></tr></thead>
            <tbody>
              {payments.map((p) => <tr key={p.id}><td>{p.payment_date}</td><td>{p.or_number || "Opening balance"}</td><td><b>{money(Number(p.amount))}</b></td><td>{p.payment_method}<small>{p.reference_number || "—"}</small></td><td>{p.remarks || "—"}</td><td>{p.created_by_email || "Imported data"}<small>{new Date(p.created_at).toLocaleString()}</small></td></tr>)}
            </tbody>
          </table>
          {!payments.length && <div className="empty">No payments recorded yet.</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
function Text({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label>
      {label}
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label>
      {label}
      <Input
        type="number"
        min="0"
        step="0.01"
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
      />
    </label>
  );
}
function DateF({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <label>
      {label}
      <Input
        type="date"
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </label>
  );
}
function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label>
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((x) => (
            <SelectItem key={x} value={x}>
              {x}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
