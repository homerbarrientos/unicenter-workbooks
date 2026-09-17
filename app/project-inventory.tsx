"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  Boxes,
  ClipboardList,
  PackageCheck,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Truck,
  Warehouse,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Project = { id: number; bid_reference: string; customer_name: string; project_name: string; bid_status: string; owner: string };
type Item = { id: number; sku: string; item_name: string; category: string; unit: string; reorder_level: number };
type Movement = { id: number; inventory_item_id: number; movement_type: string; quantity: number; movement_date: string; reference: string; project_id?: number | null };
type MaterialRequest = { id: number; request_no: string; project_id: number; purpose: string; needed_by?: string | null; status: string; requested_by: string; project?: Pick<Project, "id" | "bid_reference" | "customer_name" | "project_name"> | null };
type RequestItem = { id: number; request_id: number; inventory_item_id?: number | null; description: string; quantity_required: number; quantity_reserved: number; quantity_released: number; procurement_status: string; item?: Pick<Item, "id" | "sku" | "item_name" | "unit" | "category"> | null };
type Order = { id: number; po_number: string; material_request_id: number; supplier: string; status: string; order_date: string; expected_delivery?: string | null; remarks: string };
type OrderItem = { id: number; order_id: number; request_item_id: number; quantity_ordered: number; quantity_received: number; unit_cost: number };
type InventoryData = { role: string; projects: Project[]; items: Item[]; movements: Movement[]; requests: MaterialRequest[]; requestItems: RequestItem[]; orders: Order[]; orderItems: OrderItem[]; setupPending: boolean };
type RequestLine = { inventory_item_id: string; quantity: string };
type View = "requests" | "stock" | "orders";

const blankLine = (): RequestLine => ({ inventory_item_id: "", quantity: "1" });
const today = () => new Date().toISOString().slice(0, 10);
const quantity = (value: number) => new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(Number(value || 0));

function relation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export default function ProjectInventory() {
  const [data, setData] = useState<InventoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("requests");
  const [query, setQuery] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState<Order | null>(null);
  const [releaseRequest, setReleaseRequest] = useState<MaterialRequest | null>(null);
  const [lines, setLines] = useState<RequestLine[]>([blankLine()]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/project-inventory", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load project inventory.");
      setData(payload);
      setSelectedRequestId((current) => current && payload.requests.some((row: MaterialRequest) => row.id === current) ? current : payload.requests[0]?.id || null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load project inventory.");
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const balances = useMemo(() => {
    const result = new Map<number, number>();
    for (const movement of data?.movements || []) {
      const direction = ["Receipt", "Return", "Adjustment In"].includes(movement.movement_type) ? 1 : -1;
      result.set(movement.inventory_item_id, (result.get(movement.inventory_item_id) || 0) + Number(movement.quantity) * direction);
    }
    return result;
  }, [data?.movements]);
  const reservations = useMemo(() => {
    const activeRequestIds = new Set((data?.requests || []).filter((row) => !["Cancelled", "Fulfilled"].includes(row.status)).map((row) => row.id));
    const result = new Map<number, number>();
    for (const line of data?.requestItems || []) {
      if (!line.inventory_item_id || !activeRequestIds.has(line.request_id)) continue;
      result.set(line.inventory_item_id, (result.get(line.inventory_item_id) || 0) + Number(line.quantity_reserved) - Number(line.quantity_released));
    }
    return result;
  }, [data?.requestItems, data?.requests]);
  const filteredItems = (data?.items || []).filter((item) => `${item.sku} ${item.item_name} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
  const filteredRequests = (data?.requests || []).filter((row) => {
    const project = relation(row.project);
    return `${row.request_no} ${project?.customer_name || ""} ${project?.project_name || ""} ${row.status}`.toLowerCase().includes(query.toLowerCase());
  });
  const filteredOrders = (data?.orders || []).filter((row) => `${row.po_number} ${row.supplier} ${row.status}`.toLowerCase().includes(query.toLowerCase()));
  const selectedRequest = data?.requests.find((row) => row.id === selectedRequestId) || data?.requests[0];
  const selectedLines = (data?.requestItems || []).filter((row) => row.request_id === selectedRequest?.id);
  const selectedOrders = (data?.orders || []).filter((row) => row.material_request_id === selectedRequest?.id);
  const openOrders = (data?.orders || []).filter((row) => !["Received", "Cancelled"].includes(row.status));
  const shortageCount = (data?.requestItems || []).filter((row) => Number(row.quantity_required) > Number(row.quantity_reserved) && row.procurement_status !== "Ordered").length;
  const lowStock = (data?.items || []).filter((item) => Number(balances.get(item.id) || 0) - Number(reservations.get(item.id) || 0) <= Number(item.reorder_level || 0)).length;
  const canEdit = data?.role !== "Viewer" && !data?.setupPending;

  async function submit(action: string, value: Record<string, unknown>) {
    setSaving(true);
    try {
      const response = await fetch("/api/project-inventory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, value }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save inventory transaction.");
      setData(payload);
      return true;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not save inventory transaction.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submitForm(event: FormEvent<HTMLFormElement>, action: string, close: () => void) {
    event.preventDefault();
    if (await submit(action, Object.fromEntries(new FormData(event.currentTarget).entries()))) {
      close();
      toast.success("Transaction saved.");
    }
  }

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    const requestLines = lines.map((line) => ({
      inventory_item_id: line.inventory_item_id || null,
      description: "",
      quantity: Number(line.quantity),
      notes: "",
    }));
    if (await submit("material_request", { ...form, items: requestLines })) {
      setRequestOpen(false);
      setLines([blankLine()]);
      toast.success("Material request created and available stock reserved.");
    }
  }

  function updateLine(index: number, changes: Partial<RequestLine>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...changes } : line));
  }

  if (loading) return <div className="inventory-loading"><RefreshCw className="spin" />Loading project inventory…</div>;
  if (error) return <div className="inventory-loading error"><p>{error}</p><Button onClick={() => void load()}>Try again</Button></div>;

  return (
    <section className="inventory-workspace">
      {data?.setupPending ? <div className="inventory-setup"><AlertTriangle /><div><b>Database setup required</b><p>Apply migration 015_project_inventory_procurement.sql to enable project inventory transactions.</p></div></div> : null}

      <div className="inventory-summary">
        <article><Warehouse /><div><strong>{data?.items.length || 0}</strong><span>Stock items</span></div></article>
        <article><AlertTriangle /><div><strong>{lowStock}</strong><span>Low / zero stock</span></div></article>
        <article><ClipboardList /><div><strong>{data?.requests.filter((row) => !["Fulfilled", "Cancelled"].includes(row.status)).length || 0}</strong><span>Active requests</span></div></article>
        <article><ShoppingCart /><div><strong>{shortageCount}</strong><span>Items to purchase</span></div></article>
        <article><Truck /><div><strong>{openOrders.length}</strong><span>Open purchase orders</span></div></article>
      </div>

      <div className="inventory-toolbar">
        <div className="inventory-tabs">
          <button className={view === "requests" ? "active" : ""} onClick={() => setView("requests")}><ClipboardList />Project Materials</button>
          <button className={view === "stock" ? "active" : ""} onClick={() => setView("stock")}><Boxes />Stock Catalog</button>
          <button className={view === "orders" ? "active" : ""} onClick={() => setView("orders")}><ShoppingCart />Purchase Orders</button>
        </div>
        <div className="inventory-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records…" /></div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw />Refresh</Button>
        {canEdit && view === "requests" ? <Button onClick={() => setRequestOpen(true)}><Plus />Material request</Button> : null}
        {canEdit && view === "stock" ? <><Button variant="outline" onClick={() => setReceiptOpen(true)}><ArrowDownToLine />Receive stock</Button><Button onClick={() => setItemOpen(true)}><Plus />New item</Button></> : null}
      </div>

      {view === "requests" ? (
        <div className="inventory-request-grid">
          <div className="request-list">
            {filteredRequests.map((row) => {
              const project = relation(row.project);
              const rowLines = (data?.requestItems || []).filter((line) => line.request_id === row.id);
              const required = rowLines.reduce((sum, line) => sum + Number(line.quantity_required), 0);
              const ready = rowLines.reduce((sum, line) => sum + Number(line.quantity_reserved), 0);
              const percent = required ? Math.round(ready / required * 100) : 0;
              return <button key={row.id} className={row.id === selectedRequest?.id ? "selected" : ""} onClick={() => setSelectedRequestId(row.id)}><span><b>{row.request_no}</b><i>{row.status}</i></span><strong>{project?.customer_name}</strong><p>{project?.project_name}</p><div><span style={{ width: `${percent}%` }} /></div><small>{quantity(ready)} of {quantity(required)} ready · {percent}%</small></button>;
            })}
            {!filteredRequests.length ? <div className="inventory-empty"><ClipboardList /><p>No material requests found.</p></div> : null}
          </div>
          <div className="request-detail">
            {selectedRequest ? <>
              <div className="request-detail-head"><div><small>PROJECT MATERIAL REQUEST</small><h2>{selectedRequest.request_no}</h2><p>{relation(selectedRequest.project)?.customer_name} · {relation(selectedRequest.project)?.project_name}</p></div><span className={`inventory-status ${selectedRequest.status.toLowerCase().replaceAll(" ", "-")}`}>{selectedRequest.status}</span></div>
              <div className="request-meta"><span><small>Needed by</small><b>{selectedRequest.needed_by || "Not set"}</b></span><span><small>Requested by</small><b>{selectedRequest.requested_by || "Not set"}</b></span><span><small>Purpose</small><b>{selectedRequest.purpose || "Project requirement"}</b></span></div>
              <div className="request-actions">
                {canEdit ? <Button size="sm" variant="outline" onClick={async () => { if (await submit("allocate", { request_id: selectedRequest.id })) toast.success("Stock availability recalculated."); }}><RefreshCw />Reallocate</Button> : null}
                {canEdit && selectedLines.some((line) => Number(line.quantity_required) > Number(line.quantity_reserved) && line.procurement_status !== "Ordered") ? <Button size="sm" onClick={() => setOrderOpen(true)}><ShoppingCart />Create PO</Button> : null}
                {canEdit && selectedLines.some((line) => Number(line.quantity_reserved) > Number(line.quantity_released)) ? <Button size="sm" onClick={() => setReleaseRequest(selectedRequest)}><PackageOpen />Release reserved stock</Button> : null}
              </div>
              <div className="inventory-table"><table><thead><tr><th>Item</th><th>Required</th><th>Reserved</th><th>Released</th><th>Shortage</th><th>Procurement</th></tr></thead><tbody>{selectedLines.map((line) => <tr key={line.id}><td><b>{line.item?.sku || "Uncatalogued"}</b><span>{line.description}</span></td><td>{quantity(line.quantity_required)} {line.item?.unit || ""}</td><td>{quantity(line.quantity_reserved)}</td><td>{quantity(line.quantity_released)}</td><td className={Number(line.quantity_required) > Number(line.quantity_reserved) ? "shortage" : "ready"}>{quantity(Math.max(0, Number(line.quantity_required) - Number(line.quantity_reserved)))}</td><td><span className="line-status">{line.procurement_status}</span></td></tr>)}</tbody></table></div>
              {selectedOrders.length ? <div className="linked-orders"><h3>Linked purchase orders</h3>{selectedOrders.map((order) => <article key={order.id}><div><b>{order.po_number}</b><p>{order.supplier} · Expected {order.expected_delivery || "not set"}</p></div><span>{order.status}</span></article>)}</div> : null}
            </> : <div className="inventory-empty"><PackageCheck /><p>Select or create a project material request.</p></div>}
          </div>
        </div>
      ) : view === "stock" ? (
        <div className="inventory-card inventory-table"><table><thead><tr><th>SKU / Item</th><th>Category</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Reorder level</th></tr></thead><tbody>{filteredItems.map((item) => { const onHand = Number(balances.get(item.id) || 0); const reserved = Number(reservations.get(item.id) || 0); const available = onHand - reserved; return <tr key={item.id}><td><b>{item.sku}</b><span>{item.item_name}</span></td><td>{item.category || "—"}</td><td>{quantity(onHand)} {item.unit}</td><td>{quantity(reserved)}</td><td className={available <= Number(item.reorder_level) ? "shortage" : "ready"}>{quantity(available)}</td><td>{quantity(item.reorder_level)}</td></tr>; })}</tbody></table></div>
      ) : (
        <div className="inventory-card inventory-table"><table><thead><tr><th>PO / Supplier</th><th>Material request</th><th>Ordered</th><th>Expected delivery</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredOrders.map((order) => { const request = data?.requests.find((row) => row.id === order.material_request_id); const lines = (data?.orderItems || []).filter((line) => line.order_id === order.id); return <tr key={order.id}><td><b>{order.po_number}</b><span>{order.supplier}</span></td><td>{request?.request_no}</td><td>{lines.reduce((sum, line) => sum + Number(line.quantity_ordered), 0)} units</td><td>{order.expected_delivery || "Not set"}</td><td><span className="line-status">{order.status}</span></td><td>{canEdit && !["Received", "Cancelled"].includes(order.status) ? <Button size="sm" onClick={() => setReceiveOrder(order)}><ArrowDownToLine />Receive all</Button> : "—"}</td></tr>; })}</tbody></table></div>
      )}

      <Dialog open={itemOpen} onOpenChange={setItemOpen}><DialogContent><DialogHeader><DialogTitle>New inventory item</DialogTitle><DialogDescription>Add a reusable item to the stock catalog.</DialogDescription></DialogHeader><form className="inventory-form" onSubmit={(event) => submitForm(event, "item", () => setItemOpen(false))}><label>SKU<Input name="sku" required /></label><label>Item name<Input name="item_name" required /></label><label>Category<Input name="category" /></label><label>Unit<Input name="unit" defaultValue="pc" required /></label><label>Reorder level<Input name="reorder_level" type="number" min="0" step="0.01" defaultValue="0" /></label><DialogFooter className="wide"><Button type="button" variant="outline" onClick={() => setItemOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Add item"}</Button></DialogFooter></form></DialogContent></Dialog>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}><DialogContent><DialogHeader><DialogTitle>Receive stock</DialogTitle><DialogDescription>Record beginning balance or a direct stock receipt.</DialogDescription></DialogHeader><form className="inventory-form" onSubmit={(event) => submitForm(event, "receive_stock", () => setReceiptOpen(false))}><label className="wide">Inventory item<select name="inventory_item_id" required defaultValue=""><option value="" disabled>Select item</option>{data?.items.map((item) => <option key={item.id} value={item.id}>{item.sku} — {item.item_name}</option>)}</select></label><label>Quantity<Input name="quantity" type="number" min="0.01" step="0.01" required /></label><label>Unit cost<Input name="unit_cost" type="number" min="0" step="0.01" /></label><label>Reference<Input name="reference" placeholder="DR / PO / Opening" /></label><label>Receipt date<Input name="movement_date" type="date" defaultValue={today()} required /></label><label className="wide">Notes<textarea name="notes" rows={3} /></label><DialogFooter className="wide"><Button type="button" variant="outline" onClick={() => setReceiptOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>Receive stock</Button></DialogFooter></form></DialogContent></Dialog>

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}><DialogContent className="material-dialog"><DialogHeader><DialogTitle>New project material request</DialogTitle><DialogDescription>Available inventory will be reserved automatically; shortages will be marked for purchase. Add new catalog items first, even when their current stock is zero.</DialogDescription></DialogHeader><form className="inventory-form" onSubmit={createRequest}><label className="wide">CRM project<select name="project_id" required defaultValue=""><option value="" disabled>Select awarded or active project</option>{data?.projects.map((project) => <option key={project.id} value={project.id}>{project.bid_reference} — {project.customer_name} — {project.project_name}</option>)}</select></label><label>Needed by<Input name="needed_by" type="date" /></label><label>Requested by<Input name="requested_by" /></label><label className="wide">Purpose<Input name="purpose" placeholder="Deployment materials / customer delivery" /></label><div className="material-lines wide"><div className="material-lines-head"><b>Required materials</b><Button type="button" size="sm" variant="outline" onClick={() => setLines((current) => [...current, blankLine()])}><Plus />Add line</Button></div>{lines.map((line, index) => <div className="material-line" key={index}><select required value={line.inventory_item_id} onChange={(event) => updateLine(index, { inventory_item_id: event.target.value })}><option value="" disabled>Select catalog item</option>{data?.items.map((item) => <option key={item.id} value={item.id}>{item.sku} — {item.item_name}</option>)}</select><Input value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} type="number" min="0.01" step="0.01" required /><Button type="button" size="icon-sm" variant="ghost" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><X /></Button></div>)}</div><DialogFooter className="wide"><Button type="button" variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create and allocate"}</Button></DialogFooter></form></DialogContent></Dialog>

      <Dialog open={orderOpen} onOpenChange={setOrderOpen}><DialogContent><DialogHeader><DialogTitle>Create purchase order</DialogTitle><DialogDescription>Creates a PO for every un-ordered shortage in {selectedRequest?.request_no}.</DialogDescription></DialogHeader><form className="inventory-form" onSubmit={(event) => submitForm(event, "purchase_order", () => setOrderOpen(false))}><input type="hidden" name="request_id" value={selectedRequest?.id || ""} /><label>PO number<Input name="po_number" required /></label><label>Supplier<Input name="supplier" required /></label><label>Expected delivery<Input name="expected_delivery" type="date" /></label><label>Remarks<Input name="remarks" /></label><DialogFooter className="wide"><Button type="button" variant="outline" onClick={() => setOrderOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>Create PO</Button></DialogFooter></form></DialogContent></Dialog>

      <Dialog open={Boolean(receiveOrder)} onOpenChange={(open) => !open && setReceiveOrder(null)}><DialogContent><DialogHeader><DialogTitle>Receive purchase order</DialogTitle><DialogDescription>Receive all remaining quantities for {receiveOrder?.po_number} into inventory.</DialogDescription></DialogHeader><form className="inventory-form" onSubmit={(event) => submitForm(event, "receive_order", () => setReceiveOrder(null))}><input type="hidden" name="order_id" value={receiveOrder?.id || ""} /><label>Receipt reference<Input name="reference" defaultValue={receiveOrder?.po_number || ""} required /></label><label>Received date<Input name="received_date" type="date" defaultValue={today()} required /></label><DialogFooter className="wide"><Button type="button" variant="outline" onClick={() => setReceiveOrder(null)}>Cancel</Button><Button type="submit" disabled={saving}>Confirm receipt</Button></DialogFooter></form></DialogContent></Dialog>

      <Dialog open={Boolean(releaseRequest)} onOpenChange={(open) => !open && setReleaseRequest(null)}><DialogContent><DialogHeader><DialogTitle>Release reserved stock</DialogTitle><DialogDescription>This deducts all currently reserved quantities for {releaseRequest?.request_no} from on-hand inventory.</DialogDescription></DialogHeader><form className="inventory-form" onSubmit={(event) => submitForm(event, "release", () => setReleaseRequest(null))}><input type="hidden" name="request_id" value={releaseRequest?.id || ""} /><label>Release reference<Input name="reference" defaultValue={releaseRequest?.request_no || ""} required /></label><label>Release date<Input name="release_date" type="date" defaultValue={today()} required /></label><DialogFooter className="wide"><Button type="button" variant="outline" onClick={() => setReleaseRequest(null)}>Cancel</Button><Button type="submit" disabled={saving}>Confirm release</Button></DialogFooter></form></DialogContent></Dialog>
    </section>
  );
}
