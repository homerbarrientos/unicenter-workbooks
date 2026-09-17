import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function snapshot(supabase: Supabase, userId: string) {
  const [profile, projects, items, movements, requests, requestItems, orders, orderItems] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).single(),
    supabase.from("presales_projects").select("id,bid_reference,customer_name,project_name,bid_status,owner").order("updated_at", { ascending: false }),
    supabase.from("inventory_items").select("*").eq("active", true).order("item_name"),
    supabase.from("inventory_stock_movements").select("*").order("movement_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("project_material_requests").select("*, project:presales_projects(id,bid_reference,customer_name,project_name)").order("created_at", { ascending: false }),
    supabase.from("project_material_request_items").select("*, item:inventory_items(id,sku,item_name,unit,category)").order("id"),
    supabase.from("procurement_orders").select("*").order("created_at", { ascending: false }),
    supabase.from("procurement_order_items").select("*").order("id"),
  ]);
  const inventoryResults = [items, movements, requests, requestItems, orders, orderItems];
  const setupPending = inventoryResults.some((result) => result.error?.code === "42P01");
  const inventoryError = inventoryResults.find((result) => result.error && result.error.code !== "42P01")?.error;
  const error = profile.error || projects.error || inventoryError;
  if (error) throw error;
  return {
    role: profile.data.role,
    projects: projects.data || [],
    items: setupPending ? [] : items.data || [],
    movements: setupPending ? [] : movements.data || [],
    requests: setupPending ? [] : requests.data || [],
    requestItems: setupPending ? [] : requestItems.data || [],
    orders: setupPending ? [] : orders.data || [],
    orderItems: setupPending ? [] : orderItems.data || [],
    setupPending,
  };
}

async function getUser(supabase: Supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile ? { ...user, role: profile.role } : null;
}

export async function GET() {
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await snapshot(supabase, user.id));
  } catch (error: unknown) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load project inventory." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "Viewer") return Response.json({ error: "You have view-only access." }, { status: 403 });
  const { error: readinessError } = await supabase.from("inventory_items").select("id").limit(1);
  if (readinessError?.code === "42P01") {
    return Response.json({ error: "Apply Supabase migration 015_project_inventory_procurement.sql first." }, { status: 409 });
  }
  if (readinessError) return Response.json({ error: readinessError.message }, { status: 400 });

  const body = await request.json();
  const value = body.value || {};
  let error: { message: string } | null = null;
  if (body.action === "item") {
    if (!String(value.sku || "").trim() || !String(value.item_name || "").trim()) {
      return Response.json({ error: "SKU and item name are required." }, { status: 400 });
    }
    const result = await supabase.from("inventory_items").insert({
      sku: String(value.sku).trim().toUpperCase(),
      item_name: String(value.item_name).trim(),
      category: String(value.category || "").trim(),
      unit: String(value.unit || "pc").trim(),
      reorder_level: Number(value.reorder_level || 0),
      created_by: user.id,
      updated_by: user.id,
    });
    error = result.error;
  } else if (body.action === "receive_stock") {
    const quantity = Number(value.quantity || 0);
    if (!value.inventory_item_id || quantity <= 0) return Response.json({ error: "Select an item and enter a quantity greater than zero." }, { status: 400 });
    const result = await supabase.from("inventory_stock_movements").insert({
      inventory_item_id: Number(value.inventory_item_id),
      movement_type: "Receipt",
      quantity,
      unit_cost: Number(value.unit_cost || 0),
      reference: String(value.reference || "Opening / direct receipt").trim(),
      movement_date: value.movement_date || new Date().toISOString().slice(0, 10),
      notes: String(value.notes || "").trim(),
      created_by: user.id,
      created_by_email: user.email || "",
    });
    error = result.error;
  } else if (body.action === "material_request") {
    const items = Array.isArray(value.items) ? value.items : [];
    const result = await supabase.rpc("create_project_material_request", {
      p_project_id: Number(value.project_id),
      p_needed_by: value.needed_by || null,
      p_purpose: String(value.purpose || "").trim(),
      p_requested_by: String(value.requested_by || "").trim(),
      p_items: items,
    });
    error = result.error;
  } else if (body.action === "allocate") {
    const result = await supabase.rpc("allocate_project_material_request", { p_request_id: Number(value.request_id) });
    error = result.error;
  } else if (body.action === "purchase_order") {
    const result = await supabase.rpc("create_procurement_order", {
      p_request_id: Number(value.request_id),
      p_po_number: String(value.po_number || "").trim(),
      p_supplier: String(value.supplier || "").trim(),
      p_expected_delivery: value.expected_delivery || null,
      p_remarks: String(value.remarks || "").trim(),
    });
    error = result.error;
  } else if (body.action === "receive_order") {
    const result = await supabase.rpc("receive_procurement_order", {
      p_order_id: Number(value.order_id),
      p_reference: String(value.reference || "").trim(),
      p_received_date: value.received_date || new Date().toISOString().slice(0, 10),
    });
    error = result.error;
  } else if (body.action === "release") {
    const result = await supabase.rpc("release_project_materials", {
      p_request_id: Number(value.request_id),
      p_reference: String(value.reference || "").trim(),
      p_release_date: value.release_date || new Date().toISOString().slice(0, 10),
    });
    error = result.error;
  } else {
    return Response.json({ error: "Unsupported inventory action." }, { status: 400 });
  }
  if (error) return Response.json({ error: error.message }, { status: 400 });
  try {
    return Response.json(await snapshot(supabase, user.id));
  } catch (caught: unknown) {
    return Response.json({ error: caught instanceof Error ? caught.message : "Saved, but refresh failed." }, { status: 500 });
  }
}
