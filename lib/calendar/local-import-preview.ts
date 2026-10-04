import { z } from 'zod';
import { cellsSchema, extractionSchema, type Extraction } from './schemas';
import { ensureImportQuestions } from './import-questions';
import { clarifyExtraction } from './import-clarification';
import { editDraft } from './draft-events';
import { buildPreview } from './import-preview';
import type { Cells } from './types';
import type { ImportData, ImportPreview, ImportTransport } from './import-transport';

export const LOCAL_IMPORT_KEY = 'allvailable.synthetic-import.v1';
export const SAMPLE_RANGE = { startDate: '2026-10-03', endDate: '2026-10-04' };
const row = (id: string, label: string, intent: 'reminder' | 'uncertain'): Extraction['events'][number] => ({
  id, label, intent, sourceIds: ['synthetic-image'], startDate: SAMPLE_RANGE.startDate, endDate: SAMPLE_RANGE.startDate,
  startTime: null, endTime: null, sourceTimezone: 'Asia/Taipei', allDay: false, recurrence: null,
  unresolved: intent === 'uncertain' ? ['time'] : [], userConfirmed: false,
});
export function syntheticExtraction(): Extraction {
  return ensureImportQuestions({ sources: [{ id: 'synthetic-image', kind: 'calendar', reason: 'Synthetic fixture; no model call' }],
    events: [row('deadline', '交研究報告', 'reminder'), row('dinner', '和 Maya 吃晚餐', 'uncertain'), row('ticket', '買火車票', 'reminder')],
    visibleRanges: [{ ...SAMPLE_RANGE, complete: false }], questions: [] });
}
const importSchema = z.object({ importId: z.string(), status: z.string(), version: z.string(), extraction: extractionSchema, expiresAt: z.string() });
const stateSchema = z.object({ schema: z.literal(1), cells: cellsSchema, version: z.string(), data: importSchema.nullable() });
type State = z.infer<typeof stateSchema>;
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const initial = (): State => ({ schema: 1, cells: {}, version: '1', data: null });
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (message: string, status = 422) => reply({ error: { message } }, status);

/** Development-only in-browser transport. No fetch, credentials, or database writes. */
export function createLocalImportPreview(storage: Store, changed: () => void = () => {}, delayMs = 150) {
  const raw = storage.getItem(LOCAL_IMPORT_KEY);
  let state = raw ? stateSchema.parse(JSON.parse(raw)) : initial();
  let preview: (ImportPreview & { importVersion: string }) | null = null;
  let receipt: { previewId: string; cells: Cells; version: string } | null = null;
  let failNext = false;
  let generation = 0;
  const save = (next: State) => { storage.setItem(LOCAL_IMPORT_KEY, JSON.stringify(next)); state = next; changed(); };
  const snapshot = () => structuredClone(state);
  const transport: ImportTransport = async (path, init) => {
    const startedGeneration = generation;
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    if (startedGeneration !== generation) return problem('Local sample was reset.', 409);
    const method = init?.method ?? 'GET';
    if (path !== '/api/calendar-imports' && path !== '/api/calendar-imports/synthetic-import') return problem('Unknown local fixture request', 404);
    if (method !== 'GET' && failNext) { failNext = false; return problem('Simulated failure. Your input is retained. / 模擬失敗，輸入已保留。', 503); }
    try {
      if (path === '/api/calendar-imports' && method === 'GET') return reply({ imports: state.data ? [{ ...state.data, id: state.data.importId, gathering_id: 'synthetic-gathering', expires_at: state.data.expiresAt }] : [], webAudioAvailable: false });
      if (path === '/api/calendar-imports' && method === 'POST') {
        const data: ImportData = state.data ?? { importId: 'synthetic-import', status: 'needs_clarification', version: '1', extraction: syntheticExtraction(), expiresAt: new Date(Date.now() + 86400000).toISOString() };
        save({ ...state, data }); return reply(data);
      }
      if (method === 'DELETE') { save({ ...state, data: null }); preview = null; return reply({ deleted: true }); }
      if (method !== 'POST' || typeof init?.body !== 'string') return problem('Unsupported local request');
      const body = JSON.parse(init.body);
      if (body.action === 'apply' && receipt?.previewId === body.previewId) return reply(receipt);
      const data = state.data;
      if (!data) return problem('Import is closed. Load the sample again.', 404);
      if (body.version !== data.version) return problem('Import changed. Reload to restore your progress.', 409);
      if (body.action === 'edit_event' || body.action === 'confirm_event' || body.action === 'clarify') {
        const extraction = body.action === 'clarify' ? clarifyExtraction(data.extraction, body.answer.questionId, body.answer.value)
          : ensureImportQuestions(editDraft(data.extraction, 'edit_event', body.eventId, body.action==='confirm_event'?{reviewed:true}:body.changes));
        const next = { ...data, extraction, version: String(Number(data.version) + 1), status: extraction.questions.length ? 'needs_clarification' : 'ready' };
        save({ ...state, data: next }); preview = null; return reply(next);
      }
      if (body.action === 'preview') {
        if (body.targetVersion !== state.version) return problem('Grid changed. Refresh the preview.', 409);
        const range = body.range;
        // Use the same strict real-date validator as draft editing before computing cells.
        const checked = editDraft(data.extraction, 'edit_event', data.extraction.events[0]?.id, { date: range?.startDate, endDate: range?.endDate });
        if (!checked || !range?.startDate || !range?.endDate || range.startDate < SAMPLE_RANGE.startDate || range.endDate > SAMPLE_RANGE.endDate || range.endDate < range.startDate) return problem('Preview must stay within the invitation dates.');
        const result = buildPreview(data.extraction, { ...range, currentCells: state.cells, slotStart: '18:00', slotEnd: '22:00' });
        if (result.blockedImport || result.blockedReview) return problem('Review every item or skip it first.');
        preview = { previewId: crypto.randomUUID(), importVersion: data.version, targetVersion: state.version, changes: result.changes };
        return reply(preview);
      }
      if (body.action === 'apply') {
        if (!preview || body.previewId !== preview.previewId || body.targetVersion !== state.version || preview.targetVersion !== state.version || preview.importVersion !== data.version) return problem('Preview is stale. Refresh it first.', 409);
        const selected = z.array(z.object({ key: z.string(), status: z.enum(['red', 'yellow', 'green', 'unknown']) })).min(1).parse(body.selectedChanges);
        if (new Set(selected.map(item => item.key)).size !== selected.length || selected.some(item => !preview!.changes.some(change => change.key === item.key && change.after === item.status))) return problem('Selection does not match preview.');
        const cells = { ...state.cells };
        for (const item of selected) { if (item.status === 'unknown') delete cells[item.key]; else cells[item.key] = item.status; }
        const version = String(Number(state.version) + 1);
        save({ ...state, cells, version, data: null });
        receipt = { previewId: preview.previewId, cells, version }; preview = null;
        return reply(receipt);
      }
      return problem('Unsupported fixture action');
    } catch (error) { return problem(error instanceof Error ? error.message : 'Local fixture failed'); }
  };
  return { transport, snapshot, dispose: () => { generation++; }, failNext: () => { failNext = true; }, reset: () => { generation++; save(initial()); preview = null; receipt = null; failNext = false; },
    setCells: (cells: Cells) => { save({ ...state, cells: cellsSchema.parse(cells), version: String(Number(state.version) + 1) }); preview = null; } };
}
