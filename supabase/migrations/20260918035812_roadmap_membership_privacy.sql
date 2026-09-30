-- A membership policy cannot query its own RLS-protected table recursively.
create schema if not exists private;
create function private.is_gathering_member(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from public.memberships where gathering_id=p_id and user_id=auth.uid() and status='joined');
$$;
revoke all on function private.is_gathering_member(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.is_gathering_member(uuid) to authenticated;
drop policy "members can read membership list" on public.memberships;
create policy "members can read membership list" on public.memberships for select to authenticated
  using(user_id=(select auth.uid()) or private.is_gathering_member(gathering_id));

-- Read grants are explicit rather than relying on project-wide default grants.
grant select on public.profiles,public.gatherings,public.memberships,public.availability_drafts,public.result_snapshots,public.finalizations to authenticated;
-- All business mutations must go through transaction functions with deadline and version checks.
revoke insert,update,delete on public.gatherings,public.memberships,public.availability_drafts,public.availability_submissions,public.result_snapshots,public.finalizations from authenticated,anon;

create function public.cancel_gathering(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.gatherings;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into g from public.gatherings where id=p_id for update;
  if not found or g.host_id<>auth.uid() then raise exception 'HOST_REQUIRED'; end if;
  if g.status='finalized' then raise exception 'GATHERING_LOCKED'; end if;
  if g.status<>'cancelled' then update public.gatherings set status='cancelled',revision=revision+1 where id=g.id; end if;
  return jsonb_build_object('id',g.id,'status','cancelled');
end;
$$;
revoke all on function public.cancel_gathering(uuid) from public,anon;
grant execute on function public.cancel_gathering(uuid) to authenticated;
