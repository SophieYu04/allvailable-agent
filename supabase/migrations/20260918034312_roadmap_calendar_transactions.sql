-- Server-only RPCs: invoker privileges, explicitly unavailable to browser roles.
alter table public.calendar_connections add column sync_revision bigint not null default 0;

create function public.begin_calendar_sync(p_user_id uuid, p_provider text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.calendar_connections;
begin
  update public.calendar_connections set sync_revision = sync_revision + 1
    where user_id = p_user_id and provider = p_provider returning * into c;
  if not found then raise exception 'CALENDAR_RECONNECT_REQUIRED'; end if;
  return jsonb_build_object('generation', c.connected_at, 'revision', c.sync_revision::text);
end;
$$;

create function public.commit_calendar_sync(
  p_user_id uuid, p_provider text, p_generation timestamptz, p_revision bigint,
  p_calendar_id text, p_start timestamptz, p_end timestamptz, p_timezone text,
  p_events jsonb, p_credential jsonb default null
) returns void language plpgsql security invoker set search_path = '' as $$
declare c public.calendar_connections;
begin
  select * into c from public.calendar_connections where user_id = p_user_id and provider = p_provider for update;
  if not found or c.connected_at <> p_generation or c.sync_revision <> p_revision then
    raise exception 'CALENDAR_SYNC_SUPERSEDED';
  end if;
  if p_start >= p_end or jsonb_typeof(p_events) <> 'array' then raise exception 'CALENDAR_RANGE_INVALID'; end if;
  insert into public.external_calendar_events (
    user_id, provider, calendar_id, external_id, title, start_at, end_at, all_day,
    start_date, end_date_exclusive, source_timezone, availability, source_updated_at, source_version, html_url, synced_at
  ) select p_user_id, p_provider, p_calendar_id, e.external_id, coalesce(e.title, ''), e.start_at, e.end_at,
      e.all_day, e.start_date, e.end_date_exclusive, e.source_timezone, e.availability, e.source_updated_at, e.source_version, e.html_url, now()
    from jsonb_to_recordset(p_events) as e(external_id text, title text, start_at timestamptz, end_at timestamptz,
      all_day boolean, start_date date, end_date_exclusive date, source_timezone text, availability text,
      source_updated_at timestamptz, source_version text, html_url text)
    on conflict (user_id, provider, calendar_id, external_id) do update set
      title = excluded.title, start_at = excluded.start_at, end_at = excluded.end_at, all_day = excluded.all_day,
      start_date = excluded.start_date, end_date_exclusive = excluded.end_date_exclusive,
      source_timezone = excluded.source_timezone, availability = excluded.availability,
      source_updated_at = excluded.source_updated_at, source_version = excluded.source_version,
      html_url = excluded.html_url, synced_at = excluded.synced_at;
  delete from public.external_calendar_events e
    where e.user_id = p_user_id and e.provider = p_provider and e.calendar_id = p_calendar_id
    and (case when e.all_day then e.start_date < (p_end at time zone p_timezone)::date
      and e.end_date_exclusive > (p_start at time zone p_timezone)::date
      else e.start_at < p_end and e.end_at > p_start end)
    and not exists (select 1 from jsonb_array_elements(p_events) row where row->>'external_id' = e.external_id);
  if p_credential is not null then
    update public.calendar_credentials set access_token_ciphertext = p_credential->>'access_token_ciphertext',
      refresh_token_ciphertext = coalesce(p_credential->>'refresh_token_ciphertext', refresh_token_ciphertext),
      expires_at = (p_credential->>'expires_at')::timestamptz,
      token_type = coalesce(p_credential->>'token_type', token_type), updated_at = now()
      where user_id = p_user_id and provider = p_provider;
  end if;
  update public.calendar_connections set last_synced_at = now(), last_error = null
    where user_id = p_user_id and provider = p_provider;
end;
$$;

create function public.disconnect_calendar(p_user_id uuid, p_provider text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.calendar_connections where user_id = p_user_id and provider = p_provider for update;
  delete from public.calendar_sources where user_id = p_user_id and provider = p_provider;
  -- Foreign keys remove credentials and external events in the same transaction.
  delete from public.calendar_connections where user_id = p_user_id and provider = p_provider;
end;
$$;

revoke all on function public.begin_calendar_sync(uuid,text) from public, anon, authenticated;
revoke all on function public.commit_calendar_sync(uuid,text,timestamptz,bigint,text,timestamptz,timestamptz,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.disconnect_calendar(uuid,text) from public, anon, authenticated;
grant execute on function public.begin_calendar_sync(uuid,text) to service_role;
grant execute on function public.commit_calendar_sync(uuid,text,timestamptz,bigint,text,timestamptz,timestamptz,text,jsonb,jsonb) to service_role;
grant execute on function public.disconnect_calendar(uuid,text) to service_role;
