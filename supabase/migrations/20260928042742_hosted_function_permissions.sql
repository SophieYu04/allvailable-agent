-- Hosted Supabase grants anon EXECUTE directly in addition to PUBLIC defaults.
-- All application RPCs require authentication; retain their explicit authenticated grants.
-- Extension functions can live in public locally; leave their grants untouched.
do $$
declare application_function regprocedure;
begin
  for application_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid
          and d.deptype = 'e'
      )
  loop
    execute format('revoke execute on function %s from public, anon', application_function);
  end loop;
end;
$$;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.create_personal_calendar_for_user() from authenticated;
alter function public.touch_updated_at() set search_path = '';
