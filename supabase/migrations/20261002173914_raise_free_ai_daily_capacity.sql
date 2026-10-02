-- Increase the application throttle; provider trial stop remains the billing boundary.
CREATE OR REPLACE FUNCTION public.consume_ai_quota(p_idempotency_key text, p_user_limit integer DEFAULT 3, p_global_limit integer DEFAULT 120)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  today date := timezone('Asia/Taipei', now())::date;
  user_count integer;
  global_count integer;
  global_limit integer := least(greatest(coalesce(p_global_limit, 120), 1), 120);
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if exists (select 1 from public.ai_request_keys where user_id = auth.uid() and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('allowed', true, 'replayed', true);
  end if;
  insert into public.ai_usage_daily(usage_date, user_id) values (today, auth.uid()) on conflict (usage_date, user_id) do nothing;
  insert into public.ai_usage_global(usage_date) values (today) on conflict (usage_date) do nothing;
  select imports into user_count from public.ai_usage_daily where usage_date = today and user_id = auth.uid() for update;
  select imports into global_count from public.ai_usage_global where usage_date = today for update;
  -- Account limits are disabled; retain p_user_limit for existing RPC callers.
  if global_count >= global_limit then return jsonb_build_object('allowed', false, 'scope', 'global', 'count', global_count); end if;
  update public.ai_usage_daily set imports = imports + 1 where usage_date = today and user_id = auth.uid();
  update public.ai_usage_global set imports = imports + 1 where usage_date = today;
  insert into public.ai_request_keys(user_id, idempotency_key) values (auth.uid(), p_idempotency_key);
  return jsonb_build_object('allowed', true, 'replayed', false, 'userCount', user_count + 1, 'globalCount', global_count + 1);
end;
$function$
;
revoke all on function public.consume_ai_quota(text, integer, integer) from public;
grant execute on function public.consume_ai_quota(text, integer, integer) to authenticated;
