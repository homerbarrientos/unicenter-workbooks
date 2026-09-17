import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function snapshot(supabase: Supabase, userId: string) {
  const [
    { data: me, error: profileError },
    { data: projects, error: projectError },
    { data: templates, error: templateError },
    { data: history, error: historyError },
    { data: receivables, error: arError },
    { data: interactions, error: interactionError },
  ] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).single(),
    supabase
      .from("presales_projects")
      .select("*, current_stage:presales_stage_templates(stage_name,sequence_no,accountable_group)")
      .order("updated_at", { ascending: false }),
    supabase.from("presales_stage_templates").select("*").eq("active", true).order("sequence_no"),
    supabase
      .from("presales_stage_history")
      .select("*, stage:presales_stage_templates(stage_name,sequence_no,accountable_group,control_type)")
      .order("updated_at", { ascending: false }),
    supabase.from("ar_receivables").select("*").order("updated_at", { ascending: false }),
    supabase.from("crm_interactions").select("*").order("interaction_date", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  const crmMigrationPending = interactionError?.code === "42P01";
  const error = profileError || projectError || templateError || historyError || arError || (crmMigrationPending ? null : interactionError);
  if (error) throw error;
  return {
    role: me.role,
    projects: projects || [],
    templates: templates || [],
    history: history || [],
    receivables: receivables || [],
    interactions: interactions || [],
    crmMigrationPending,
  };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await snapshot(supabase, user.id));
  } catch (error: unknown) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load Cockpit One." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || me.role === "Viewer") return Response.json({ error: "You have view-only access." }, { status: 403 });

  const { error: readinessError } = await supabase.from("crm_interactions").select("id").limit(1);
  if (readinessError?.code === "42P01") {
    return Response.json({ error: "Apply Supabase migration 014_cockpit_crm.sql before saving CRM data." }, { status: 409 });
  }
  if (readinessError) return Response.json({ error: readinessError.message }, { status: 400 });

  const body = await request.json();
  const source = body.value || {};
  if (body.action === "interaction") {
    if (!source.project_id || !String(source.notes || "").trim()) {
      return Response.json({ error: "Project and interaction notes are required." }, { status: 400 });
    }
    const { error } = await supabase.from("crm_interactions").insert({
      project_id: Number(source.project_id),
      interaction_type: source.interaction_type || "Client meeting",
      notes: String(source.notes).trim(),
      interaction_date: source.interaction_date || new Date().toISOString().slice(0, 10),
      next_action: String(source.next_action || "").trim(),
      next_action_date: source.next_action_date || null,
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
  } else if (body.action === "opportunity") {
    if (!String(source.customer_name || "").trim() || !String(source.project_name || "").trim()) {
      return Response.json({ error: "Customer and project are required." }, { status: 400 });
    }
    const { data: project, error: createError } = await supabase.rpc("create_presales_project", {
      p_bid_reference: "",
      p_auto_reference: true,
      p_customer_name: String(source.customer_name).trim(),
      p_project_name: String(source.project_name).trim(),
      p_opportunity_value: Number(source.opportunity_value || 0),
      p_owner: String(source.owner || "").trim(),
      p_priority: source.priority || "Medium",
      p_bid_status: "Active",
      p_start_date: source.start_date || new Date().toISOString().slice(0, 10),
      p_expected_bid_date: source.expected_bid_date || null,
      p_remarks: String(source.opportunity_summary || "").trim(),
    });
    if (createError) return Response.json({ error: createError.message }, { status: 400 });
    const { error: updateError } = await supabase.from("presales_projects").update({
      probability: Number(source.probability || 20),
      project_type: String(source.project_type || "").trim(),
      business_model: source.business_model || "Unicenter-Managed",
      primary_contact: String(source.primary_contact || "").trim(),
      contact_role: String(source.contact_role || "").trim(),
      next_action: String(source.next_action || "Schedule discovery meeting").trim(),
      next_action_date: source.next_action_date || null,
      opportunity_summary: String(source.opportunity_summary || "").trim(),
    }).eq("id", project.id);
    if (updateError) return Response.json({ error: updateError.message }, { status: 400 });
  } else {
    return Response.json({ error: "Unsupported CRM action." }, { status: 400 });
  }

  try {
    return Response.json(await snapshot(supabase, user.id));
  } catch (error: unknown) {
    return Response.json({ error: error instanceof Error ? error.message : "Saved, but refresh failed." }, { status: 500 });
  }
}
