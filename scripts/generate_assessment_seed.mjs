import fs from "node:fs";

const sources = [
  ["finance", "/tmp/unicenter-assess-53VvHM/UNICENTER_2.0_30-Day_Finance_AR_Assessment_Dashboard.json"],
  ["procurement", "/tmp/unicenter-assess-53VvHM/UNICENTER_2.0_30-Day_Procurement_Inventory_Assessment_Dashboard.json"],
];
const q = (value) => value == null || value === "" ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const rows = [];
for (const [type, file] of sources) {
  const { values } = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const r of values.slice(1)) {
    rows.push(`(${q(type)},${q(r[3])},${q(r[4])},${q(r[0])},${q(r[2])},${q(r[5])},${n(r[6], 5)},${n(r[1])},${q(r[22] || "No")})`);
  }
}

const sql = `-- Adds the two 30-day operational assessment workbooks to the live dashboard.
alter table public.control_records drop constraint if exists control_records_type_check;
alter table public.control_records add constraint control_records_type_check
  check(type in('plan','action','risk','assessment','qbo','finance','procurement'));

alter table public.control_records add column if not exists area text not null default '';
alter table public.control_records add column if not exists evidence_check text not null default '';
alter table public.control_records add column if not exists target_rating numeric(3,1) not null default 5 check(target_rating between 0 and 5);
alter table public.control_records add column if not exists domain_weight numeric(5,4) not null default 0;
alter table public.control_records add column if not exists assessed boolean not null default false;
alter table public.control_records add column if not exists finding text not null default '';
alter table public.control_records add column if not exists corrective_action text not null default '';
alter table public.control_records add column if not exists target_date date;
alter table public.control_records add column if not exists critical_control boolean not null default false;
alter table public.control_records add column if not exists review_notes text not null default '';

insert into public.control_records
  (type,code,title,domain,area,evidence_check,target_rating,domain_weight,critical_control)
values
${rows.join(",\n")}
on conflict(type,code) do update set
  title=excluded.title,
  domain=excluded.domain,
  area=excluded.area,
  evidence_check=excluded.evidence_check,
  target_rating=excluded.target_rating,
  domain_weight=excluded.domain_weight,
  critical_control=excluded.critical_control;
`;

fs.writeFileSync("supabase/migrations/003_operational_assessments.sql", sql);
console.log(`Generated ${rows.length} assessment rows.`);
