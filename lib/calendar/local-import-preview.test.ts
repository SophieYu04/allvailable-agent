import { expect, it } from 'vitest';
import { createLocalImportPreview, LOCAL_IMPORT_KEY, SAMPLE_RANGE, syntheticExtraction } from './local-import-preview';
import { clarifyExtraction } from './import-clarification';
import type { ImportPreview } from './import-transport';
import { buildPreview } from './import-preview';

function store() { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; }
function harness() {
  const storage = store(); const session = createLocalImportPreview(storage, undefined, 0);
  const load = () => session.transport('/api/calendar-imports', { method: 'POST', body: new FormData() });
  const send = (body: object) => session.transport('/api/calendar-imports/synthetic-import', { method: 'POST', body: JSON.stringify({ version: session.snapshot().data?.version, ...body }) });
  const skip = (eventId: string) => send({ action: 'edit_event', eventId, changes: { delete: true } });
  const ready = async () => { await load(); await skip('deadline'); await skip('ticket'); await send({ action: 'clarify', answer: { questionId: 'dinner-time', value: '19:00-20:30' } }); await send({ action: 'edit_event', eventId: 'dinner', changes: { reviewed: true } }); };
  const preview = () => send({ action: 'preview', range: SAMPLE_RANGE, targetVersion: session.snapshot().version });
  return { storage, session, send, skip, load, ready, preview };
}
it('requires review, makes exactly three busy proposals, and only applies selected cells once', async () => {
  const h = harness(); await h.load(); expect((await h.preview()).status).toBe(422);
  await h.ready(); const preview = await (await h.preview()).json() as ImportPreview;
  expect(preview.changes.map((c: {key: string}) => c.key)).toEqual(['2026-10-03-19:00', '2026-10-03-19:30', '2026-10-03-20:00']);
  expect(h.session.snapshot().cells).toEqual({}); // Preview/cancel never writes.
  const apply = { action: 'apply', previewId: preview.previewId, targetVersion: preview.targetVersion, selectedChanges: preview.changes.map((c: {key: string;after: string}) => ({ key: c.key, status: c.after })) };
  expect((await h.send(apply)).status).toBe(200); const saved = h.session.snapshot();
  expect(Object.values(saved.cells)).toEqual(['red', 'red', 'red']);
  expect((await h.send(apply)).status).toBe(200); expect(h.session.snapshot()).toEqual(saved);
});
it('restores confirmations and skips from only the dedicated local key', async () => {
  const h = harness(); await h.ready();
  const restored = createLocalImportPreview(h.storage, undefined, 0);
  expect(restored.snapshot()).toEqual(h.session.snapshot());
  expect(restored.snapshot().data?.extraction.events).toHaveLength(1);
  expect(restored.snapshot().data?.extraction.events[0].userConfirmed).toBe(true);
  expect(h.storage.getItem(LOCAL_IMPORT_KEY)).not.toBeNull();
});
it('all skips and closing leave the grid unchanged', async () => {
  const h = harness(); await h.load(); await h.skip('deadline'); await h.skip('dinner'); await h.skip('ticket');
  expect(h.session.snapshot().data?.extraction.events).toEqual([]); expect(h.session.snapshot().cells).toEqual({});
  expect((await h.preview()).ok).toBe(false);
  await h.session.transport('/api/calendar-imports/synthetic-import', { method: 'DELETE' });
  expect(h.session.snapshot().data).toBeNull(); expect(h.session.snapshot().cells).toEqual({});
});
it('failure retains the same import and a retry succeeds without duplicating rows', async () => {
  const h = harness(); h.session.failNext(); expect((await h.load()).status).toBe(503); await h.load();
  const before = h.session.snapshot(); h.session.failNext(); expect((await h.skip('deadline')).status).toBe(503); expect(h.session.snapshot()).toEqual(before);
  await h.skip('deadline'); expect(h.session.snapshot().data?.extraction.events.map(e => e.id)).toEqual(['dinner', 'ticket']);
});
it('marks existing cells as existing and preserves them when unchecked', async () => {
  const h = harness(); h.session.setCells({ '2026-10-03-19:30': 'green' }); await h.ready();
  const p = await (await h.preview()).json() as ImportPreview;
  expect(p.changes.find((c: {key:string}) => c.key.endsWith('19:30'))?.before).toBe('green');
  await h.send({ action: 'apply', previewId: p.previewId, targetVersion: p.targetVersion, selectedChanges: p.changes.filter((c: {before:string}) => c.before === 'unknown').map((c: {key:string;after:string}) => ({key:c.key,status:c.after})) });
  expect(h.session.snapshot().cells['2026-10-03-19:30']).toBe('green');
});
it('rejects stale preview versions and tampered selections', async () => {
  const h = harness(); await h.ready(); const p = await (await h.preview()).json() as ImportPreview;
  expect((await h.send({ action: 'apply', previewId: p.previewId, targetVersion: p.targetVersion, selectedChanges: [{ key: '2026-10-04-21:00', status: 'green' }] })).ok).toBe(false);
  h.session.setCells({ '2026-10-04-21:00': 'yellow' });
  expect((await h.send({ action: 'apply', previewId: p.previewId, targetVersion: p.targetVersion, selectedChanges: p.changes })).status).toBe(409);
});
it('does not accept invalid dates, times, or guessed timezones', () => {
  const extraction = syntheticExtraction();
  expect(() => clarifyExtraction(extraction, 'dinner-time', '25:00-26:00')).toThrow();
  const event = extraction.events[1]; event.startDate = null; event.endDate = null; event.sourceTimezone = null;
  extraction.questions.push({ id: 'dinner-date', eventId: 'dinner', kind: 'date', prompt: 'date' }, { id: 'dinner-timezone', eventId: 'dinner', kind: 'timezone', prompt: 'zone' });
  expect(() => clarifyExtraction(extraction, 'dinner-date', '2026-02-30')).toThrow();
  const invalid = clarifyExtraction(extraction, 'dinner-timezone', 'not/a/timezone');
  expect(invalid.events[1].sourceTimezone).toBeNull();
  expect(buildPreview(invalid, { ...SAMPLE_RANGE, currentCells: {} }).changes).toEqual([]);
});
it('reset invalidates an in-flight request before it can recreate the old sample', async () => {
  const storage = store(); const session = createLocalImportPreview(storage, undefined, 5);
  const request = session.transport('/api/calendar-imports', { method: 'POST', body: new FormData() });
  session.reset(); expect((await request).status).toBe(409); expect(session.snapshot().data).toBeNull();
});
it('rejects unexpected paths without falling through to real network requests', async () => {
  const h = harness(); expect((await h.session.transport('https://api.example.com')).status).toBe(404);
});
