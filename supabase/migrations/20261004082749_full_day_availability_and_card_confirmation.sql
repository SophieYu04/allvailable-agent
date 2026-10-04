-- Invitation hours select the initial viewport; replies may mark all 24 hours.
create or replace function public.submit_availability(
  p_gathering_id uuid,
  p_expected_draft_version bigint,
  p_cells jsonb,
  p_changes jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g public.gatherings;
  draft public.availability_drafts;
  next_submission_version bigint;
  previous public.availability_submissions;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if jsonb_typeof(coalesce(p_cells, '{}'::jsonb)) <> 'object' then raise exception 'INVALID_CELLS'; end if;
  if exists (select 1 from jsonb_each_text(coalesce(p_cells, '{}'::jsonb)) item where item.key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-([01][0-9]|2[0-3]):(00|30)$' or item.value not in ('unknown', 'green', 'yellow', 'red')) then raise exception 'INVALID_CELLS'; end if;
  select * into g from public.gatherings where id = p_gathering_id for update;
  if not found then raise exception 'GATHERING_NOT_FOUND'; end if;
  if exists (
    select 1 from jsonb_each_text(coalesce(p_cells, '{}'::jsonb)) item
    where (substring(item.key from 1 for 10)::date < g.date_start or substring(item.key from 1 for 10)::date > g.date_end)
  ) then raise exception 'CELL_OUT_OF_RANGE'; end if;
  if g.status in ('draft', 'finalized', 'cancelled') or now() >= g.deadline_at then raise exception 'GATHERING_LOCKED'; end if;
  if not exists (select 1 from public.memberships where gathering_id = p_gathering_id and user_id = auth.uid() and status = 'joined') then raise exception 'NOT_MEMBER'; end if;
  select * into draft from public.availability_drafts where gathering_id = p_gathering_id and user_id = auth.uid() for update;
  if draft.version is distinct from p_expected_draft_version then raise exception 'VERSION_CONFLICT'; end if;
  select * into previous from public.availability_submissions where gathering_id=p_gathering_id and user_id=auth.uid();
  if found and previous.cells=p_cells then return jsonb_build_object('submitted',true,'submissionVersion',previous.version::text,'gatheringRevision',g.revision::text); end if;
  select coalesce(max(version), 0) + 1 into next_submission_version from public.availability_submissions where gathering_id = p_gathering_id and user_id = auth.uid();
  insert into public.availability_submissions(gathering_id, user_id, cells, version, submitted_at) values (p_gathering_id, auth.uid(), p_cells, next_submission_version, now())
    on conflict (gathering_id, user_id) do update set cells = excluded.cells, version = excluded.version, submitted_at = excluded.submitted_at;
  insert into public.personal_calendar_versions(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  perform public.apply_personal_busy_cells((select version from public.personal_calendar_versions where user_id = auth.uid()), (select coalesce(jsonb_agg(jsonb_build_object('date',substring(e.key,1,10),'minute',split_part(substring(e.key,12),':',1)::integer*60+split_part(substring(e.key,12),':',2)::integer,'status',e.value)), '[]'::jsonb) from jsonb_each_text(p_cells) e));
  update public.gatherings set revision = revision + 1, status = case when status = 'draft' then 'open' else status end where id = p_gathering_id;
  return jsonb_build_object('submitted', true, 'submissionVersion', next_submission_version::text, 'gatheringRevision', (g.revision + 1)::text);
end;
$$;

create or replace function public.save_availability_draft(p_gathering_id uuid,p_version bigint,p_cells jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.gatherings; d public.availability_drafts;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into g from public.gatherings where id=p_gathering_id for update;
  if not found then raise exception 'GATHERING_NOT_FOUND'; end if;
  if not exists(select 1 from public.memberships where gathering_id=g.id and user_id=auth.uid() and status='joined') then raise exception 'NOT_MEMBER'; end if;
  select * into d from public.availability_drafts where gathering_id=g.id and user_id=auth.uid() for update;
  if d.cells=p_cells and d.version=p_version+1 then return jsonb_build_object('cells',d.cells,'version',d.version::text); end if;
  if g.status in ('draft','finalized','cancelled') or now()>=g.deadline_at then raise exception 'GATHERING_LOCKED'; end if;
  if d.version is distinct from p_version then raise exception 'VERSION_CONFLICT'; end if;
  if jsonb_typeof(p_cells) <> 'object' or exists(select 1 from jsonb_each_text(p_cells) e where e.key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-([01][0-9]|2[0-3]):(00|30)$' or e.value not in ('unknown','green','yellow','red')) then raise exception 'INVALID_CELLS'; end if;
  if exists(select 1 from jsonb_each(p_cells) e where substring(e.key,1,10)::date not between g.date_start and g.date_end) then raise exception 'CELL_OUT_OF_RANGE'; end if;
  update public.availability_drafts set cells=p_cells,version=version+1,updated_at=now() where gathering_id=g.id and user_id=auth.uid() returning * into d;
  return jsonb_build_object('cells',d.cells,'version',d.version::text);
end;
$$;

-- Persist the confirmed personal interval and review decision atomically.
create or replace function public.confirm_calendar_import_event(p_import_id uuid,p_version bigint,p_event_id text,p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.calendar_imports; event jsonb; idx int; personal_version bigint;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 select * into r from public.calendar_imports where id=p_import_id and user_id=auth.uid() for update;
 if not found then raise exception 'IMPORT_NOT_FOUND'; end if;
 if r.expires_at<=now() then raise exception 'IMPORT_EXPIRED'; end if;
 if r.version is distinct from p_version then raise exception 'VERSION_CONFLICT'; end if;
 select value,ordinality::int-1 into event,idx from jsonb_array_elements(r.extraction->'events') with ordinality where value->>'id'=p_event_id;
 if event is null then raise exception 'EVENT_NOT_FOUND'; end if;
 if coalesce((event->>'userConfirmed')::boolean,false) then
  return jsonb_build_object('importId',r.id,'version',r.version::text,'status',r.status,'extraction',r.extraction,'expiresAt',r.expires_at);
 end if;
 insert into public.personal_calendar_versions(user_id) values(auth.uid()) on conflict(user_id) do nothing;
 select version into personal_version from public.personal_calendar_versions where user_id=auth.uid() for update;
 perform public.apply_personal_busy_cells(personal_version,p_changes);
 event:=jsonb_set(event,'{userConfirmed}','true'::jsonb);
 if event->>'intent'='uncertain' then event:=jsonb_set(event,'{intent}','"busy"'::jsonb); end if;
 r.extraction:=jsonb_set(r.extraction,array['events',idx::text],event);
 r.extraction:=jsonb_set(r.extraction,'{questions}',(select coalesce(jsonb_agg(q),'[]'::jsonb) from jsonb_array_elements(r.extraction->'questions') q where q->>'eventId' is distinct from p_event_id));
 update public.calendar_imports set extraction=r.extraction,version=version+1,updated_at=now() where id=r.id returning * into r;
 return jsonb_build_object('importId',r.id,'version',r.version::text,'status',r.status,'extraction',r.extraction,'expiresAt',r.expires_at);
end;
$$;
revoke all on function public.confirm_calendar_import_event(uuid,bigint,text,jsonb) from public,anon;
grant execute on function public.confirm_calendar_import_event(uuid,bigint,text,jsonb) to authenticated;
