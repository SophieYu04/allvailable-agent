// Disposable hosted acceptance for the transcript reported by the user.
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const origin = process.env.ALLVAILABLE_TEST_ORIGIN;
if (url !== 'https://mccbaouodyprmqplxeav.supabase.co' || !origin?.startsWith('https://')) throw Error('Dedicated project and HTTPS origin required');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, options);
let userId, gatheringId;
try {
  const email = `allvailable-daily-${randomUUID()}@example.test`;
  const password = `${randomUUID()}Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  const token = login.data.session.access_token;
  const createdGathering = await client.rpc('create_gathering_once', { p_key: randomUUID(), p_input: { name: 'Synthetic daily voice acceptance', dateStart: '2035-10-03', dateEnd: '2035-10-04', dailyStart: '15:00', dailyEnd: '20:00', duration: 60, deadline: '2035-10-02T10:00:00Z', saveAsDraft: false, hostParticipates: true } });
  if (createdGathering.error) throw createdGathering.error;
  gatheringId = createdGathering.data.id;
  const form = new FormData();
  form.set('mode', 'live_voice');
  form.set('gatheringId', gatheringId);
  form.set('transcript', 'I can do it every day between 4pm to 6pm.');
  const response = await fetch(`${origin}/api/calendar-imports`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': randomUUID() }, body: form });
  const result = await response.json();
  if (!response.ok) throw Error(`Import HTTP ${response.status}: ${result.error?.code ?? 'unknown'}`);
  const event = result.extraction?.events?.[0];
  if (result.extraction.events.length !== 1 || event.intent !== 'available' || event.startDate !== '2035-10-03' || event.startTime !== '16:00' || event.endTime !== '18:00' || event.recurrence?.frequency !== 'daily' || event.recurrence?.until !== '2035-10-04') throw Error('Daily availability card did not match the transcript');
  console.log('PASS hosted transcript created one daily Available card');
  const confirm = await fetch(`${origin}/api/calendar-imports/${result.importId}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm_event', version: result.version, eventId: event.id }) });
  const confirmed = await confirm.json();
  if (!confirm.ok || !confirmed.extraction.events.find(item => item.id === event.id)?.userConfirmed) throw Error(`Card confirmation failed: ${confirmed.error?.code ?? confirm.status}`);
  console.log('PASS hosted card confirmation');
} finally {
  const errors = [];
  if (gatheringId) { const removed = await admin.from('gatherings').delete().eq('id', gatheringId); if (removed.error) errors.push(removed.error); }
  if (userId) { const removed = await admin.auth.admin.deleteUser(userId); if (removed.error) errors.push(removed.error); }
  if (errors.length) throw new AggregateError(errors, 'Synthetic cleanup failed');
  console.log('PASS synthetic data cleaned up');
}
