import { createClient } from "@/lib/supabase/server";

const bucket = "presales-documents";
const safeName = (name: string) => name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");

async function access() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return { supabase, user, role: me?.role || "Viewer" };
}

export async function POST(request: Request) {
  const auth = await access();
  if (auth.error) return auth.error;
  const { supabase, user, role } = auth;
  if (role === "Viewer") return Response.json({ error: "You have view-only access." }, { status: 403 });
  const form = await request.formData();
  const historyId = Number(form.get("history_id"));
  const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  if (!historyId || !files.length) return Response.json({ error: "Select at least one file." }, { status: 400 });
  const { data: history, error: historyError } = await supabase.from("presales_stage_history").select("id,project_id").eq("id", historyId).single();
  if (historyError || !history) return Response.json({ error: "Stage record not found." }, { status: 404 });
  const errors: string[] = [];
  for (const file of files) {
    if (file.size > 15728640) { errors.push(`${file.name}: exceeds 15 MB`); continue; }
    const path = `${history.project_id}/${historyId}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const upload = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (upload.error) { errors.push(`${file.name}: ${upload.error.message}`); continue; }
    const inserted = await supabase.from("presales_attachments").insert({ project_id: history.project_id, history_id: historyId, file_name: file.name, storage_path: path, mime_type: file.type || "application/octet-stream", file_size: file.size, uploaded_by: user.id, uploaded_by_email: user.email || "" });
    if (inserted.error) { await supabase.storage.from(bucket).remove([path]); errors.push(`${file.name}: ${inserted.error.message}`); }
  }
  if (errors.length === files.length) return Response.json({ error: errors.join("; ") }, { status: 400 });
  return Response.json({ uploaded: files.length - errors.length, errors });
}

export async function DELETE(request: Request) {
  const auth = await access();
  if (auth.error) return auth.error;
  const { supabase, role } = auth;
  if (role === "Viewer") return Response.json({ error: "You have view-only access." }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  const { data: attachment, error } = await supabase.from("presales_attachments").select("storage_path").eq("id", id).single();
  if (error || !attachment) return Response.json({ error: "Attachment not found." }, { status: 404 });
  const removed = await supabase.storage.from(bucket).remove([attachment.storage_path]);
  if (removed.error) return Response.json({ error: removed.error.message }, { status: 400 });
  const deleted = await supabase.from("presales_attachments").delete().eq("id", id);
  if (deleted.error) return Response.json({ error: deleted.error.message }, { status: 400 });
  return Response.json({ success: true });
}
