create or replace function public.sync_presales_noa_bid_status()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_sequence_no integer;
begin
  select sequence_no
    into v_sequence_no
    from public.presales_stage_templates
    where id=new.stage_id;

  if v_sequence_no=12 and new.status<>'Completed' then
    update public.presales_projects
       set bid_status='Active',
           current_stage_id=new.stage_id
     where id=new.project_id
       and bid_status='Won';
  end if;

  return new;
end;
$$;

drop trigger if exists sync_presales_noa_bid_status
  on public.presales_stage_history;

create trigger sync_presales_noa_bid_status
after update of status on public.presales_stage_history
for each row
when (old.status is distinct from new.status)
execute function public.sync_presales_noa_bid_status();

-- Repair bids already left as Won after Stage 12 was reopened.
update public.presales_projects p
   set bid_status='Active',
       current_stage_id=h.stage_id
  from public.presales_stage_history h
  join public.presales_stage_templates t on t.id=h.stage_id
 where h.project_id=p.id
   and t.sequence_no=12
   and h.status<>'Completed'
   and p.bid_status='Won';
