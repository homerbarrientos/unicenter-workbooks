import { createClient } from "@/lib/supabase/server";

const projectFields = [
  "bid_reference", "customer_name", "project_name", "opportunity_value", "owner",
  "priority", "bid_status", "start_date", "expected_bid_date", "remarks",
] as const;

async function snapshot(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const [{ data: me, error: profileError }, { data: templates, error: templateError }, { data: projects, error: projectError }, { data: history, error: historyError }, { data: attachmentRows, error: attachmentError }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).single(),
    supabase.from("presales_stage_templates").select("*").eq("active", true).order("sequence_no"),
    supabase.from("presales_projects").select("*, current_stage:presales_stage_templates(stage_name,sequence_no,accountable_group)").order("updated_at", { ascending: false }),
    supabase.from("presales_stage_history").select("*, stage:presales_stage_templates(*)").order("updated_at", { ascending: false }),
    supabase.from("presales_attachments").select("*").order("created_at", { ascending: false }),
  ]);
  const attachmentTableMissing = attachmentError?.code === "42P01";
  const error = profileError || templateError || projectError || historyError || (attachmentTableMissing ? null : attachmentError);
  if (error) throw error;
  const attachments = await Promise.all((attachmentRows || []).map(async attachment => {
    const { data } = await supabase.storage.from("presales-documents").createSignedUrl(attachment.storage_path, 3600);
    return { ...attachment, download_url: data?.signedUrl || "" };
  }));
  return { role: me.role, templates: templates || [], projects: projects || [], history: history || [], attachments };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try { return Response.json(await snapshot(supabase, user.id)); }
  catch (error: unknown) { return Response.json({ error: error instanceof Error ? error.message : "Could not load Pre-Sales data." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || me.role === "Viewer") return Response.json({ error: "You have view-only access." }, { status: 403 });
  const body = await request.json();
  let error = null;
  if (body.action === "stage") {
    const value = body.value || {};
    const result = await supabase.rpc("update_presales_stage", {
      p_history_id: Number(value.id), p_status: value.status, p_assigned_to: value.assigned_to || "",
      p_planned_start: value.planned_start || null, p_due_date: value.due_date || null,
      p_actual_start: value.actual_start || null, p_completed_date: value.completed_date || null,
      p_documents_complete: Boolean(value.documents_complete), p_notes: value.notes || "",
    });
    error = result.error;
  } else {
    const source = body.value || {};
    const value = Object.fromEntries(projectFields.map((key) => {
      const raw = source[key];
      if (key === "opportunity_value") return [key, Number(raw || 0)];
      if (key === "expected_bid_date") return [key, raw || null];
      return [key, String(raw ?? "").trim()];
    }));
    if (!value.bid_reference || !value.customer_name || !value.project_name)
      return Response.json({ error: "Bid reference, customer, and project name are required." }, { status: 400 });
    const result = source.id
      ? await supabase.from("presales_projects").update(value).eq("id", source.id)
      : await supabase.from("presales_projects").insert({ ...value, created_by: user.id });
    error = result.error;
  }
  if (error) return Response.json({ error: error.message }, { status: 400 });
  try { return Response.json(await snapshot(supabase, user.id)); }
  catch (snapshotError: unknown) { return Response.json({ error: snapshotError instanceof Error ? snapshotError.message : "Saved, but refresh failed." }, { status: 500 }); }
}
