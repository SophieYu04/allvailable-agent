"use client";
import { useEffect, useRef, useState } from 'react';
import { browserImportTransport, type ImportTransport, type ImportData, type ImportPreview as Preview } from '@/lib/calendar/import-transport';
import { createAudioCapture } from '@/lib/calendar/audio-capture';
import type { Cells } from '@/lib/calendar/types';
import { useLanguage } from '@/components/dining/Language';
type Props = { transport?: ImportTransport; sampleUploadLabel?: string; gatheringId?: string; dateStart?: string; dateEnd?: string; draftVersion?: string; currentCells?: Cells; personalVersion?: string; onApplied?: (cells: Cells, version?: string) => void; beforePreview?: () => Promise<string>; onActivity?: (active: boolean) => void };
export default function ImportPanel({ transport = browserImportTransport, sampleUploadLabel, gatheringId, dateStart, dateEnd, draftVersion = '1', personalVersion = '1', currentCells = {}, onApplied, beforePreview, onActivity }: Props) {
  const { t, language } = useLanguage();
  const [data, setData] = useState<ImportData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [canRetry, setCanRetry] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [range, setRange] = useState({ startDate: dateStart ?? '', endDate: dateEnd ?? '' });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState(false);
  const [webAudioAvailable, setWebAudioAvailable] = useState(false);
  const pending = useRef<{ form: FormData; key: string } | null>(null);
  const capture = useRef<ReturnType<typeof createAudioCapture> | null>(null);
  const [captureStarting, setCaptureStarting] = useState(false);
  const [recordingQuestion, setRecordingQuestion] = useState<string | undefined>();
  const panel = useRef<HTMLElement | null>(null);
  const previousFocusKey = useRef('');
  const cardHeading = useRef<HTMLHeadingElement | null>(null);
  const reviewSummary = useRef<HTMLParagraphElement | null>(null);
  const mutex = useRef(false);
  const alive = useRef(true);
  const interactionLocked = busy || recording || captureStarting;
  const status = (s: string) => ({ green: t('可以', 'Available'), red: t('忙碌', 'Busy'), yellow: t('待確認', 'Tentative'), unknown: t('未填', 'Unknown') }[s] ?? s);
  useEffect(() => () => onActivity?.(false), [onActivity]);
  useEffect(() => { onActivity?.(busy || recording || captureStarting || Boolean(data)); }, [busy, recording, captureStarting, data, onActivity]);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    transport('/api/calendar-imports').then(async r => {
      if (!r.ok) return;
      const body = await r.json() as { imports?: (ImportData & {id:string;gathering_id?:string;expires_at:string})[]; webAudioAvailable?: boolean };
      if (!cancelled) setWebAudioAvailable(body.webAudioAvailable === true);
      const saved = body.imports?.find((item: { gathering_id?: string }) => gatheringId ? item.gathering_id === gatheringId : !item.gathering_id);
      if (!cancelled && saved && !pending.current && !mutex.current) setData({ ...saved, importId: saved.id, version: String(saved.version), expiresAt: saved.expires_at });
    }).catch(() => {});
    return () => { cancelled = true; alive.current = false; capture.current?.cancel(); };
  }, [gatheringId, transport]);
  async function request<T = Record<string, unknown>>(path: string, body?: unknown, method = 'POST') {
    const r = await transport(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await r.json() as T & {error?:{message?:string}};
    if (!r.ok) throw new Error(result.error?.message ?? t('操作失敗，請重試', 'Request failed. Please retry.'));
    return result;
  }
  async function run(action: () => Promise<void>) {
    if (mutex.current || capture.current?.isActive()) return;
    mutex.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : t('操作失敗', 'Request failed')); }
    finally { mutex.current = false; if (alive.current) setBusy(false); }
  }
  async function upload(form?: FormData) {
    if (mutex.current || capture.current?.isActive()) return;
    if (form) { if (gatheringId) form.set('gatheringId', gatheringId); pending.current = { form, key: crypto.randomUUID() }; setCanRetry(true); }
    const item = pending.current; if (!item) return;
    await run(async () => {
      const r = await transport('/api/calendar-imports', { method: 'POST', headers: { 'Idempotency-Key': item.key }, body: item.form });
      const body = await r.json() as ImportData & {error?:{message?:string}};
      if (!r.ok) throw new Error(body.error?.message ?? t('上傳失敗，檔案已保留', 'Upload failed. Your files are retained.'));
      if (!alive.current) return;
      setData(body); setPreview(null); setSelected([]); setAnswers({}); pending.current = null; setCanRetry(false);
      const first = body.extraction.visibleRanges?.[0];
      if (!dateStart && first) setRange({ startDate: first.startDate, endDate: first.endDate });
    });
  }
  function cancelRecording() { capture.current?.cancel(); setRecording(false); setCaptureStarting(false); setRecordingQuestion(undefined); }
  async function record(questionId?: string) {
    if (mutex.current) return;
    if (recording) { if (recordingQuestion === questionId) capture.current?.stop(); return; }
    if (capture.current?.isActive()) return;
    if (!webAudioAvailable) { setError(t('網頁語音尚未設定，請使用文字。', 'Web voice is not configured. Enter text instead.')); return; }
    capture.current ??= createAudioCapture();
    setCaptureStarting(true); setRecordingQuestion(questionId); setError('');
    try {
      await capture.current.start((blob, mime) => {
        if (!alive.current) return;
        setRecording(false); setCaptureStarting(false); setRecordingQuestion(undefined);
        const form = new FormData(); form.set('audio', blob, mime.includes('mp4') ? 'voice.m4a' : 'voice.webm');
        if (questionId && data) {
          form.set('questionId', questionId); form.set('version', data.version);
          void run(async () => {
            const r = await transport(`/api/calendar-imports/${data.importId}/clarify-voice`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: form });
            const answer = await r.json() as { value?: string; error?: { message?: string } };
            if (!r.ok || !answer.value) throw new Error(answer.error?.message ?? t('語音回答失敗，請用文字重試', 'Voice answer failed. Please retry with text.'));
            const result = await request<ImportData>(`/api/calendar-imports/${data.importId}`, { action: 'clarify', version: data.version, counted: true, answer: { questionId, value: answer.value } });
            if (alive.current) { setData({ ...data, ...result, version: String(result.version) }); setPreview(null); }
          });
        } else void upload(form);
      }, () => { if (alive.current) { setCaptureStarting(false); setRecording(true); } });
    } catch { if (alive.current) { setCaptureStarting(false); setRecordingQuestion(undefined); setError(t('無法使用麥克風，請上傳圖片或手動填寫。', 'Microphone unavailable. Upload a screenshot or enter times manually.')); } }
  }
  function clarify(questionId: string, value: string) { if (!data || !value.trim()) return; void run(async () => {
    const body = await request<ImportData>(`/api/calendar-imports/${data.importId}`, { action: 'clarify', version: data.version, answer: { questionId, value } });
    setData({ ...data, ...body, version: String(body.version) }); setPreview(null);
  }); }
  const eventQueue = data?.extraction.events.filter(event => event.userConfirmed !== true) ?? [];
  const activeEvent = eventQueue[0];
  const focusKey = activeEvent ? `${activeEvent.id}:${data?.version}` : data ? preview?.previewId ?? 'review-complete' : '';
  useEffect(() => {
    if (focusKey) (cardHeading.current ?? reviewSummary.current)?.focus();
    else if (previousFocusKey.current) panel.current?.querySelector<HTMLElement>('input[type=file],button')?.focus();
    previousFocusKey.current = focusKey;
  }, [focusKey]);
  const activeQuestions = activeEvent ? data?.extraction.questions.filter(question => question.eventId === activeEvent.id) ?? [] : [];
  const globalQuestions = data?.extraction.questions.filter(question => question.eventId === null) ?? [];
  const eventHasExactTime = Boolean(activeEvent?.allDay || (activeEvent?.startTime && activeEvent?.endTime));
  const eventReady = Boolean(activeEvent && activeEvent.startDate && activeEvent.endDate && activeEvent.sourceTimezone && eventHasExactTime && !activeEvent.unresolved.length && !activeQuestions.length && ['busy','available','tentative','uncertain'].includes(activeEvent.intent));
  function confirmEvent() {
    if (!activeEvent || !eventReady) return;
    void run(async () => {
      let nextData = data!;
      const body = await request<ImportData>(`/api/calendar-imports/${data!.importId}`, { action: 'edit_event', version: data!.version, eventId: activeEvent.id, changes: { reviewed: true } });
      nextData = { ...data!, ...body, version: String(body.version) };
      setData(nextData);
      setPreview(null);
    });
  }
  function skipEvent() {
    if (!data || !activeEvent) return;
    void run(async () => {
      const body = await request<ImportData>(`/api/calendar-imports/${data.importId}`, { action: 'edit_event', version: data.version, eventId: activeEvent.id, changes: { delete: true } });
      setData({ ...data, ...body, version: String(body.version) });
      setPreview(null);
    });
  }
  function makePreview() { if (!data) return; void run(async () => {
    const targetVersion = beforePreview ? await beforePreview() : gatheringId ? draftVersion : personalVersion;
    const body = await request<Preview>(`/api/calendar-imports/${data.importId}`, { action: 'preview', version: data.version, range, targetVersion });
    setPreview(body); setSelected(body.changes.filter((c: { before: string }) => c.before === 'unknown').map((c: { key: string }) => c.key));
  }); }
  function apply() { if (!data || !preview) return; void run(async () => {
    const changes = preview.changes.filter(c => selected.includes(c.key));
    const body = await request<{cells?:Cells;version:string}>(`/api/calendar-imports/${data.importId}`, { action: 'apply', version: data.version, previewId: preview.previewId, targetVersion: preview.targetVersion, selectedChanges: changes.map(c => ({ key: c.key, status: c.after })) });
    const next = { ...currentCells }; changes.forEach(c => { if (c.after === 'unknown' || (!gatheringId && c.after === 'green')) delete next[c.key]; else next[c.key] = c.after as Cells[string]; });
    onApplied?.(body.cells ?? next, String(body.version)); setData(null); setPreview(null); setSelected([]);
  }); }
  return <section ref={panel} className="import-panel" aria-label={t('提供與確認時間', 'Provide and review availability')}>
    <p className="dining-eyebrow">01 / {t('提供時間', 'PROVIDE YOUR TIMES')}</p><h2>{t('提供你的時間', 'Add your times')}</h2>
    <p>{t('先確認，再加入草稿。私人行程不公開。', 'Review first. Your calendar stays private.')}</p>
    {!data && sampleUploadLabel && transport !== browserImportTransport ? <button disabled={interactionLocked} onClick={() => upload(new FormData())}>{sampleUploadLabel}</button> : !data && <div className="import-inputs"><label className="upload-tile"><strong>↥ {t('上傳行事曆或單日清單', 'Calendar or dated task-list screenshot')}</strong><span>PNG / JPG / WebP · {t('最多 5 張，每張 5 MB', 'Up to 5 files, 5 MB each')}</span><input aria-label={t('選擇截圖', 'Choose screenshots')} type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={interactionLocked} onChange={e => { const form = new FormData(); Array.from(e.target.files ?? []).forEach(f => form.append('images', f)); if (e.target.files?.length) void upload(form); e.target.value = ''; }} /></label>{webAudioAvailable ? <button disabled={busy || captureStarting} className="upload-tile" onClick={() => record()}><strong>{recording ? '◼' : '◉'} {recording ? t('停止並辨識', 'Stop and transcribe') : t('用語音說時間', 'Record voice')}</strong><span>{t('例如：10 月 3 日晚上七點到九點可以', 'Date · time · timezone')} · 60s</span></button> : <div className="upload-tile"><strong>{t('用文字補充時間', 'Type a time correction')}</strong><span>{t('先上傳截圖，再逐項輸入時間。', 'Upload a screenshot, then type each exact time.')}</span></div>}</div>}
    {(recording || captureStarting) && <div role="status" className="dining-message">{captureStarting ? t('正在開啟麥克風…', 'Opening microphone…') : t('錄音中…', 'Recording…')}<button onClick={cancelRecording}>{t('取消錄音', 'Cancel recording')}</button></div>}
    {busy && <p role="status">{t('正在處理，請保留此頁…', 'Processing…')}</p>}
    {error && <div role="alert" className="dining-message">{error}{canRetry && <button disabled={interactionLocked} onClick={() => upload()}>{t('重試上傳', 'Retry upload')}</button>}</div>}
    {data && <><p className="dining-eyebrow">02 / {t('確認辨識', 'REVIEW')}</p>
      {data.status === 'rejected' ? <p>{t('沒有辨識到行事曆資料，請換一張截圖。', 'No calendar information recognized. Try another screenshot.')}</p> : <>
        {globalQuestions.map(q => <div className="clarify-field" key={q.id}><label htmlFor={`answer-${q.id}`}>{language === 'zh' ? q.prompt : ({title:'Confirm the item name.',date:'Confirm the full date (including year).',time:'Confirm start and end times.',all_day:'Is this all day, or should it have exact times?',timezone:'Confirm the IANA timezone (e.g. Asia/Taipei).',intent:'Clarify what this item means.',range:'Confirm the date range.'}[q.kind])}</label><input id={`answer-${q.id}`} disabled={interactionLocked} value={answers[q.id] ?? ''} placeholder={q.kind === 'date' ? 'YYYY-MM-DD' : q.kind === 'time' ? '18:00-20:00' : t('輸入答案', 'Your answer')} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} /><div className="dining-actions">{q.options?.map(o => <button disabled={interactionLocked} key={o} onClick={() => clarify(q.id, o)}>{o}</button>)}{webAudioAvailable && <button disabled={busy || captureStarting || (recording && recordingQuestion !== q.id)} onClick={() => record(q.id)}>{recording ? t('停止語音回答','Stop recording') : t('用語音回答','Answer by voice')}</button>}<button disabled={interactionLocked || !answers[q.id]?.trim()} onClick={() => clarify(q.id, answers[q.id])}>{t('確認答案', 'Confirm answer')}</button></div></div>)}
        {activeEvent ? <article className="event-review-card" aria-live="polite">
          <p className="dining-eyebrow">{t('逐筆確認', 'ONE AT A TIME')} · {data.extraction.events.length - eventQueue.length + 1}/{data.extraction.events.length}</p>
          <h3 ref={cardHeading} tabIndex={-1}>{activeEvent.label ?? t('未命名事項', 'Untitled item')}</h3>
          <p>
            {activeEvent.startDate ?? t('日期待確認', 'Date needed')}
            {activeEvent.allDay ? <> · {t('全天', 'All day')}{activeEvent.endDate !== activeEvent.startDate && <> → {activeEvent.endDate ?? t('結束日期待確認', 'End date needed')}</>}</> : <> · {activeEvent.startTime ?? '—'} → {activeEvent.endDate !== activeEvent.startDate && <>{activeEvent.endDate ?? t('結束日期待確認', 'End date needed')} · </>}{activeEvent.endTime ?? '—'}</>}
            <br />{activeEvent.sourceTimezone ?? t('時區待確認', 'Timezone needed')} · {activeEvent.intent === 'reminder' ? t('提醒', 'Reminder') : activeEvent.intent === 'uncertain' ? t('確認後標為忙碌', 'Confirm as busy') : status(activeEvent.intent === 'available' ? 'green' : activeEvent.intent === 'tentative' ? 'yellow' : 'red')}
          </p>
          <p>{t('核對日期、時間與時區。期限或不需排程的項目可略過；預覽後才加入草稿。', 'Check dates, times and timezone. Skip items you do not need to schedule. Preview before saving to your draft.')}</p>
          {activeQuestions.map(q => <div className="clarify-field" key={q.id}><label htmlFor={`answer-${q.id}`}>{language === 'zh' ? q.prompt : ({title:'Confirm the item name.',date:'Confirm the full date (including year).',time:'Confirm start and end times.',all_day:'Is this all day, or should it have exact times?',timezone:'Confirm the IANA timezone (e.g. Asia/Taipei).',intent:'Are you busy, tentative or available?',range:'Confirm the date range.'}[q.kind])}</label><input id={`answer-${q.id}`} disabled={interactionLocked} value={answers[q.id] ?? ''} placeholder={q.kind === 'date' ? 'YYYY-MM-DD' : q.kind === 'time' ? '18:00-20:00' : t('輸入答案', 'Your answer')} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} /><div className="dining-actions">{q.options?.map(o => <button disabled={interactionLocked} key={o} onClick={() => clarify(q.id, o)}>{t(o, ({'真的全天不能':'Busy all day','指定起訖':'Specify exact times','只是提醒不占時間':'Reminder only','暫時未知':'Not sure yet','不能參加':'Busy','可能有事':'Tentative','可以參加':'Available'} as Record<string,string>)[o] ?? o)}</button>)}{webAudioAvailable && <button disabled={busy || captureStarting || (recording && recordingQuestion !== q.id)} onClick={() => record(q.id)}>{recording ? t('停止語音回答','Stop recording') : t('用語音回答','Answer by voice')}</button>}<button disabled={interactionLocked || !answers[q.id]?.trim()} onClick={() => clarify(q.id, answers[q.id])}>{t('確認答案', 'Confirm answer')}</button></div></div>)}
          <div className="dining-actions"><button disabled={interactionLocked} onClick={skipEvent}>{t('略過這項', 'Skip item')}</button><button className="dining-primary" disabled={interactionLocked || !eventReady} onClick={confirmEvent}>{activeEvent.intent === 'uncertain' ? t('確認忙碌並繼續', 'Confirm busy and continue') : t('確認並下一項', 'Confirm and continue')}</button></div>
        </article> : <p ref={reviewSummary} tabIndex={-1} role="status" className="dining-message">{data.extraction.events.length ? t('所有項目已確認，請預覽變更。', 'Every item is reviewed. Preview your changes.') : t('已全部略過，表格沒有變更。可結束匯入。', 'All items skipped. Your grid is unchanged. Close this import to start again.')}</p>}
        {!preview && <><div className="dining-form"><label>{t('日期從', 'From date')}<input type="date" disabled={interactionLocked} min={dateStart} max={dateEnd} value={range.startDate} onChange={e => setRange({ ...range, startDate: e.target.value })} /></label><label>{t('日期到', 'To date')}<input type="date" disabled={interactionLocked} min={dateStart} max={dateEnd} value={range.endDate} onChange={e => setRange({ ...range, endDate: e.target.value })} /></label></div><p>{t('空白不代表有空。', 'Blank ≠ available.')}</p><button disabled={interactionLocked || eventQueue.length > 0 || !data.extraction.events.length || !!data.extraction.questions.length || !range.startDate || !range.endDate} onClick={makePreview}>{t('預覽時段變更', 'Preview')}</button></>}
        {preview && <><p>{t('預設只選未填格，勾選其他格才會覆蓋。', 'Select changes to apply. Existing entries are unchecked.')}</p><div className="import-change-list">{preview.changes.map(c => <label key={c.key}><input type="checkbox" disabled={interactionLocked} checked={selected.includes(c.key)} onChange={e => setSelected(old => e.target.checked ? [...old, c.key] : old.filter(k => k !== c.key))} />{c.key} · {status(c.before)} → {status(c.after)}</label>)}</div>{!preview.changes.length && <p>{t('這個範圍沒有變更。', 'No changes within this range.')}</p>}<div className="dining-actions"><button disabled={interactionLocked} onClick={() => setPreview(null)}>{t('返回／重新預覽', 'Back / refresh preview')}</button><button className="dining-primary" disabled={interactionLocked || !selected.length} onClick={apply}>{t('確認加入草稿', 'Save to draft')}</button></div></>}
      </>}
      <button disabled={interactionLocked} onClick={() => run(async () => { await request(`/api/calendar-imports/${data.importId}`, undefined, 'DELETE'); setData(null); setPreview(null); setAnswers({}); setSelected([]); })}>{t('結束這次匯入', 'Close import')}</button>
    </>}
  </section>;
}
