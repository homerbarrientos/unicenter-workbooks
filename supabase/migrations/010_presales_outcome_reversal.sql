alter table public.presales_stage_history
add column if not exists auto_skipped boolean not null default false;

update public.presales_stage_history
set auto_skipped=true
where status='Skipped'
  and outcome='Not Applicable'
  and notes='Automatically skipped after unsuccessful bid outcome.';

create or replace function public.update_presales_stage(
  p_history_id bigint,p_status text,p_outcome text,p_assigned_to text,p_planned_start date,p_due_date date,
  p_actual_start date,p_completed_date date,p_documents_complete boolean,p_notes text
) returns public.presales_stage_history language plpgsql security definer set search_path=public as $$
declare
  v_history public.presales_stage_history;
  v_stage public.presales_stage_templates;
  v_project public.presales_projects;
  v_next bigint;
  v_outcome text:=coalesce(p_outcome,'Pending');
begin
  if public.current_user_role() not in ('Admin','Editor') then raise exception 'You have view-only access.'; end if;
  select * into v_history from public.presales_stage_history where id=p_history_id for update;
  if not found then raise exception 'Stage record not found.'; end if;
  select * into v_stage from public.presales_stage_templates where id=v_history.stage_id;
  select * into v_project from public.presales_projects where id=v_history.project_id for update;

  if p_status<>'Completed' then v_outcome:='Pending'; end if;
  if v_stage.sequence_no in (7,10,11) and p_status='Completed' and v_outcome not in ('Passed','Failed','Not Applicable') then
    raise exception 'Select Passed, Failed, or Not Applicable before completing this decision stage.';
  end if;
  if p_status='Skipped' then v_outcome:='Not Applicable'; end if;

  update public.presales_stage_history set status=p_status,outcome=v_outcome,assigned_to=coalesce(p_assigned_to,''),
    planned_start=p_planned_start,due_date=p_due_date,actual_start=p_actual_start,completed_date=case when p_status='Completed' then p_completed_date else null end,
    documents_complete=coalesce(p_documents_complete,false),notes=coalesce(p_notes,''),auto_skipped=false,
    updated_by=auth.uid(),updated_by_email=coalesce(auth.jwt()->>'email',''),updated_at=now()
  where id=p_history_id returning * into v_history;

  -- Reopen a bid when its failed decision is corrected or returned to work.
  if v_stage.sequence_no in (7,10,11) and v_project.bid_status='Lost' and not (p_status='Completed' and v_outcome='Failed') then
    update public.presales_projects set bid_status='Active',current_stage_id=v_history.stage_id where id=v_history.project_id;
    update public.presales_stage_history h set status='Not Started',outcome='Pending',auto_skipped=false,
      notes=case when h.notes='Automatically skipped after unsuccessful bid outcome.' then '' else h.notes end,
      updated_by=auth.uid(),updated_by_email=coalesce(auth.jwt()->>'email',''),updated_at=now()
    from public.presales_stage_templates t where h.project_id=v_history.project_id and h.stage_id=t.id
      and t.sequence_no>v_stage.sequence_no and h.auto_skipped=true;
  end if;

  if v_stage.sequence_no in (7,10,11) and p_status='Completed' and v_outcome='Failed' then
    update public.presales_projects set bid_status='Lost',current_stage_id=v_history.stage_id where id=v_history.project_id;
    update public.presales_stage_history h set status='Skipped',outcome='Not Applicable',auto_skipped=true,
      notes=case when h.notes='' then 'Automatically skipped after unsuccessful bid outcome.' else h.notes end,
      updated_by=auth.uid(),updated_by_email=coalesce(auth.jwt()->>'email',''),updated_at=now()
    from public.presales_stage_templates t where h.project_id=v_history.project_id and h.stage_id=t.id
      and t.sequence_no>v_stage.sequence_no and h.status not in ('Completed','Skipped');
  elsif v_stage.sequence_no=12 and p_status='Completed' then
    update public.presales_projects set bid_status='Won',current_stage_id=v_history.stage_id where id=v_history.project_id;
    select h.id into v_next from public.presales_stage_history h join public.presales_stage_templates t on t.id=h.stage_id
      where h.project_id=v_history.project_id and t.sequence_no>v_stage.sequence_no and h.status='Not Started' order by t.sequence_no limit 1;
  elsif p_status='Completed' then
    select h.id into v_next from public.presales_stage_history h join public.presales_stage_templates t on t.id=h.stage_id
      where h.project_id=v_history.project_id and t.sequence_no>v_stage.sequence_no and h.status='Not Started' order by t.sequence_no limit 1;
  else
    update public.presales_projects set current_stage_id=v_history.stage_id where id=v_history.project_id;
  end if;

  if v_next is not null then
    update public.presales_stage_history h set status='In Progress',outcome='Pending',auto_skipped=false,
      actual_start=coalesce(h.actual_start,current_date),planned_start=coalesce(h.planned_start,current_date),
      due_date=coalesce(h.due_date,current_date+t.target_days),updated_by=auth.uid(),
      updated_by_email=coalesce(auth.jwt()->>'email',''),updated_at=now()
    from public.presales_stage_templates t where h.id=v_next and t.id=h.stage_id;
    update public.presales_projects set current_stage_id=(select stage_id from public.presales_stage_history where id=v_next) where id=v_history.project_id;
  end if;

  insert into public.audit_logs(user_id,user_email,action,record_type,record_code,changes)
  values(auth.uid(),coalesce(auth.jwt()->>'email',''),'Stage updated','presales_stage',v_stage.stage_name,
    jsonb_build_object('stage',to_jsonb(v_history),'outcome',v_outcome,'bid_status',(select bid_status from public.presales_projects where id=v_history.project_id)));
  return v_history;
end;$$;

revoke all on function public.update_presales_stage(bigint,text,text,text,date,date,date,date,boolean,text) from public;
grant execute on function public.update_presales_stage(bigint,text,text,text,date,date,date,date,boolean,text) to authenticated;
