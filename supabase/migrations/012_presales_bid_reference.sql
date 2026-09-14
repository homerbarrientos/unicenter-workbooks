create or replace function public.create_presales_project(
  p_bid_reference text,
  p_auto_reference boolean,
  p_customer_name text,
  p_project_name text,
  p_opportunity_value numeric,
  p_owner text,
  p_priority text,
  p_bid_status text,
  p_start_date date,
  p_expected_bid_date date,
  p_remarks text
) returns public.presales_projects
language plpgsql
security definer
set search_path=public
as $$
declare
  v_reference text;
  v_next_number bigint;
  v_project public.presales_projects;
begin
  if public.current_user_role() not in ('Admin','Editor') then
    raise exception 'You have view-only access.';
  end if;

  perform pg_advisory_xact_lock(hashtext('unicenter-presales-bid-reference'));

  if coalesce(p_auto_reference,false) or nullif(trim(p_bid_reference),'') is null then
    select coalesce(max((substring(bid_reference from '^BID-UC-([0-9]+)$'))::bigint),0)+1
      into v_next_number
      from public.presales_projects
      where bid_reference ~ '^BID-UC-[0-9]+$';
    v_reference := 'BID-UC-' || lpad(v_next_number::text,3,'0');
  else
    v_reference := upper(trim(p_bid_reference));
    if v_reference !~ '^BID-UC-[0-9]{3,}$' then
      raise exception 'Bid reference must follow the pattern BID-UC-001.';
    end if;
  end if;

  if exists(select 1 from public.presales_projects where bid_reference=v_reference) then
    raise exception 'Bid reference % already exists.',v_reference;
  end if;

  insert into public.presales_projects(
    bid_reference,customer_name,project_name,opportunity_value,owner,priority,
    bid_status,start_date,expected_bid_date,remarks,created_by
  ) values (
    v_reference,trim(p_customer_name),trim(p_project_name),coalesce(p_opportunity_value,0),
    coalesce(trim(p_owner),''),p_priority,p_bid_status,p_start_date,p_expected_bid_date,
    coalesce(trim(p_remarks),''),auth.uid()
  ) returning * into v_project;

  return v_project;
end;
$$;

revoke all on function public.create_presales_project(text,boolean,text,text,numeric,text,text,text,date,date,text) from public;
grant execute on function public.create_presales_project(text,boolean,text,text,numeric,text,text,text,date,date,text) to authenticated;
