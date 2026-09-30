begin;
select plan(9);

select has_table('public', 'calendar_deadlines', 'calendar_deadlines exists');
select has_column('public', 'calendar_deadlines', 'due_on', 'deadlines use a date-only due_on column');
select ok((select relrowsecurity from pg_class where oid = 'public.calendar_deadlines'::regclass), 'calendar_deadlines has RLS enabled');
select policies_are('public', 'calendar_deadlines', array[
  'deadline owners can read',
  'deadline owners can create',
  'deadline owners can update',
  'deadline owners can delete'
], 'only owner policies protect deadlines');

-- The auth trigger creates matching profiles while this transaction is running.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'deadline-owner@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'deadline-stranger@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.calendar_deadlines (user_id, title, due_on)
values ('11111111-1111-1111-1111-111111111111', 'Owner deadline', '2026-09-25');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select results_eq(
  $$select title from public.calendar_deadlines order by title$$,
  $$values ('Owner deadline'::text)$$,
  'an owner reads their own deadline'
);
select results_eq(
  $$insert into public.calendar_deadlines (user_id, title, due_on) values ('11111111-1111-1111-1111-111111111111', 'Owner created', '2026-09-26') returning title$$,
  $$values ('Owner created'::text)$$,
  'an owner creates a deadline for themselves'
);

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is_empty(
  $$select 1 from public.calendar_deadlines where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'a different user cannot read owner deadlines'
);
select is_empty(
  $$update public.calendar_deadlines set title = 'Changed' where user_id = '11111111-1111-1111-1111-111111111111' returning id$$,
  'a different user cannot update owner deadlines'
);
select is_empty(
  $$delete from public.calendar_deadlines where user_id = '11111111-1111-1111-1111-111111111111' returning id$$,
  'a different user cannot delete owner deadlines'
);

select * from finish();
rollback;
