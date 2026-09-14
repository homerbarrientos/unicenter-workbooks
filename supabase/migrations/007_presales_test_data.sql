-- UNICENTER 2.0 Pre-Sales & Bid Management test data
-- Safe to rerun: bid_reference values are unique and use the TEST- prefix.
-- Run 006_presales_bid_management.sql before this script.

insert into public.presales_projects
  (bid_reference,customer_name,project_name,opportunity_value,owner,priority,bid_status,start_date,expected_bid_date,remarks)
values
  ('TEST-BID-001','City Government of Davao','Network Infrastructure Upgrade',4850000,'Jethrow','High','Active',current_date-18,current_date+12,'Test case: active bid with completed early stages.'),
  ('TEST-BID-002','Provincial Government of Cotabato','Data Center Equipment Supply',7250000,'Jethrow','Critical','Active',current_date-35,current_date+5,'Test case: overdue and blocked bid stage.'),
  ('TEST-BID-003','University of Southern Mindanao','Campus Wi-Fi Expansion',3200000,'Pre-Sales Team','Medium','Won',current_date-70,current_date-20,'Test case: completed winning bid.'),
  ('TEST-BID-004','Regional Medical Center','Server and Storage Procurement',6100000,'Bids Team','High','Lost',current_date-55,current_date-15,'Test case: lost bid for win-rate computation.'),
  ('TEST-BID-005','Electric Cooperative Sample','Cybersecurity Assessment Services',1950000,'Jethrow','Medium','On Hold',current_date-10,current_date+30,'Test case: client-controlled waiting period.')
on conflict (bid_reference) do update set
  customer_name=excluded.customer_name,project_name=excluded.project_name,opportunity_value=excluded.opportunity_value,
  owner=excluded.owner,priority=excluded.priority,bid_status=excluded.bid_status,start_date=excluded.start_date,
  expected_bid_date=excluded.expected_bid_date,remarks=excluded.remarks;

-- TEST-BID-001: stages 1-3 complete, stage 4 in progress and on time.
update public.presales_stage_history h set
  status='Completed',planned_start=p.start_date+(t.sequence_no-1)*2,due_date=p.start_date+(t.sequence_no-1)*2+coalesce(t.target_days,3),
  actual_start=p.start_date+(t.sequence_no-1)*2,completed_date=p.start_date+(t.sequence_no-1)*2+1,
  documents_complete=true,notes='Test completion: stage completed on time.'
from public.presales_projects p,public.presales_stage_templates t
where h.project_id=p.id and h.stage_id=t.id and p.bid_reference='TEST-BID-001' and t.sequence_no between 1 and 3;
update public.presales_stage_history h set status='In Progress',planned_start=current_date-1,due_date=current_date+3,actual_start=current_date-1,assigned_to='Jethrow',notes='Waiting for final internal approval.'
from public.presales_projects p,public.presales_stage_templates t where h.project_id=p.id and h.stage_id=t.id and p.bid_reference='TEST-BID-001' and t.sequence_no=4;
update public.presales_projects p set current_stage_id=t.id from public.presales_stage_templates t where p.bid_reference='TEST-BID-001' and t.sequence_no=4;

-- TEST-BID-002: stages 1-8 complete, document-check stage blocked and overdue.
update public.presales_stage_history h set
  status='Completed',planned_start=p.start_date+(t.sequence_no-1)*3,due_date=p.start_date+(t.sequence_no-1)*3+coalesce(t.target_days,4),
  actual_start=p.start_date+(t.sequence_no-1)*3,completed_date=p.start_date+(t.sequence_no-1)*3+2,
  documents_complete=true,notes='Test completion for critical bid.'
from public.presales_projects p,public.presales_stage_templates t
where h.project_id=p.id and h.stage_id=t.id and p.bid_reference='TEST-BID-002' and t.sequence_no between 1 and 8;
update public.presales_stage_history h set status='Blocked',planned_start=current_date-8,due_date=current_date-4,actual_start=current_date-8,assigned_to='Bids Team',documents_complete=false,notes='Missing client eligibility document; escalation required.'
from public.presales_projects p,public.presales_stage_templates t where h.project_id=p.id and h.stage_id=t.id and p.bid_reference='TEST-BID-002' and t.sequence_no=9;
update public.presales_projects p set current_stage_id=t.id from public.presales_stage_templates t where p.bid_reference='TEST-BID-002' and t.sequence_no=9;

-- TEST-BID-003: all stages complete; won project.
update public.presales_stage_history h set
  status='Completed',planned_start=p.start_date+(t.sequence_no-1)*2,due_date=p.start_date+(t.sequence_no-1)*2+coalesce(t.target_days,4),
  actual_start=p.start_date+(t.sequence_no-1)*2,completed_date=p.start_date+(t.sequence_no-1)*2+2,
  documents_complete=true,notes='Test winning-bid history.'
from public.presales_projects p,public.presales_stage_templates t
where h.project_id=p.id and h.stage_id=t.id and p.bid_reference='TEST-BID-003';
update public.presales_projects p set current_stage_id=t.id from public.presales_stage_templates t where p.bid_reference='TEST-BID-003' and t.sequence_no=24;

-- TEST-BID-004: lost after bid opening. Remaining stages are skipped.
update public.presales_stage_history h set status='Completed',planned_start=p.start_date+(t.sequence_no-1)*3,due_date=p.start_date+(t.sequence_no-1)*3+coalesce(t.target_days,4),actual_start=p.start_date+(t.sequence_no-1)*3,completed_date=p.start_date+(t.sequence_no-1)*3+3,documents_complete=true,notes='Test lost-bid history.'
from public.presales_projects p,public.presales_stage_templates t where h.project_id=p.id and h.stage_id=t.id and p.bid_reference='TEST-BID-004' and t.sequence_no<=10;
update public.presales_stage_history h set status='Skipped',notes='Not applicable after bid was lost.'
from public.presales_projects p,public.presales_stage_templates t where h.project_id=p.id and h.stage_id=t.id and p.bid_reference='TEST-BID-004' and t.sequence_no>10;
update public.presales_projects p set current_stage_id=t.id from public.presales_stage_templates t where p.bid_reference='TEST-BID-004' and t.sequence_no=10;

-- TEST-BID-005: client-controlled TOR/PhilGEPS waiting period.
update public.presales_stage_history h set status='Completed',planned_start=p.start_date+(t.sequence_no-1)*2,due_date=p.start_date+(t.sequence_no-1)*2+coalesce(t.target_days,3),actual_start=p.start_date+(t.sequence_no-1)*2,completed_date=p.start_date+(t.sequence_no-1)*2+1,documents_complete=true,notes='Initial internal activity completed.'
from public.presales_projects p,public.presales_stage_templates t where h.project_id=p.id and h.stage_id=t.id and p.bid_reference='TEST-BID-005' and t.sequence_no<=4;
update public.presales_stage_history h set status='In Progress',planned_start=current_date-2,due_date=null,actual_start=current_date-2,assigned_to='Client',notes='On hold while client prepares TOR, budget, and PhilGEPS publication.'
from public.presales_projects p,public.presales_stage_templates t where h.project_id=p.id and h.stage_id=t.id and p.bid_reference='TEST-BID-005' and t.sequence_no=5;
update public.presales_projects p set current_stage_id=t.id from public.presales_stage_templates t where p.bid_reference='TEST-BID-005' and t.sequence_no=5;

-- Optional cleanup after testing:
-- delete from public.presales_projects where bid_reference like 'TEST-%';
