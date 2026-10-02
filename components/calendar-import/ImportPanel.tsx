"use client";
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Mic, Clock3 } from 'lucide-react';
import { browserImportTransport, type ImportTransport, type ImportData, type ImportPreview as Preview } from '@/lib/calendar/import-transport';
import SwipeReviewCard from './SwipeReviewCard';
import { startLiveSpeech } from '@/lib/calendar/live-speech';
import { buildPreview } from '@/lib/calendar/import-preview';
import { createAudioCapture } from '@/lib/calendar/audio-capture';
import type { Cells } from '@/lib/calendar/types';
import { useLanguage } from '@/components/dining/Language';
type Props = { dailyStart?: string; dailyEnd?: string; onCardApplied?: (cells:Cells)=>void; compact?: boolean; onManualEntry?: () => void; transport?: ImportTransport; sampleUploadLabel?: string; gatheringId?: string; dateStart?: string; dateEnd?: string; draftVersion?: string; currentCells?: Cells; personalVersion?: string; onApplied?: (cells: Cells, version?: string) => void; beforePreview?: () => Promise<string>; onActivity?: (active: boolean) => void };
export default function ImportPanel({ dailyStart, dailyEnd, onCardApplied, compact = false, onManualEntry, transport = browserImportTransport, sampleUploadLabel, gatheringId, dateStart, dateEnd, draftVersion = '1', personalVersion = '1', currentCells = {}, onApplied, beforePreview, onActivity }: Props) {
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
  const [liveTranscript, setLiveTranscript] = useState('');
  const [captionUnavailable, setCaptionUnavailable] = useState(false);
  const speech = useRef<ReturnType<typeof startLiveSpeech>>(null);
  const [recordedClip, setRecordedClip] = useState<{blob:Blob;mime:string;questionId?:string}|null>(null);
  const confirmOnStop = useRef(false);
  const [editingCard, setEditingCard] = useState(false);
  const [cardFields,setCardFields] = useState({title:'',date:'',endDate:'',startTime:'',endTime:'',sourceTimezone:'Asia/Taipei',intent:'available',allDay:false});
  const [webAudioAvailable, setWebAudioAvailable] = useState<boolean | null>(null);
  const pending = useRef<{ form: FormData; key: string } | null>(null);
  const capture = useRef<ReturnType<typeof createAudioCapture> | null>(null);
  const [captureStarting, setCaptureStarting] = useState(false);
  const [recordingQuestion, setRecordingQuestion] = useState<string | undefined>();
  const panel = useRef<HTMLElement | null>(null);
  const previousFocusKey = useRef('');
  const cardHeading = useRef<HTMLHeadingElement | null>(null);
  const reviewSummary = useRef<HTMLParagraphElement | null>(null);
  const mutex = useRef(false);
  const operationEpoch = useRef(0);
  const uploadController = useRef<AbortController | null>(null);
  const cancelledUploads = useRef(new Set<string>());
  const [uploading, setUploading] = useState(false);
  const alive = useRef(true);
  const interactionLocked = busy || recording || captureStarting || Boolean(recordedClip);
  const status = (s: string) => ({ green: t('可以', 'Available'), red: t('忙碌', 'Busy'), yellow: t('待確認', 'Tentative'), unknown: t('未填', 'Unknown') }[s] ?? s);
  useEffect(() => () => onActivity?.(false), [onActivity]);
  useEffect(() => { onActivity?.(busy || recording || captureStarting || Boolean(data) || Boolean(recordedClip)); }, [busy, recording, captureStarting, data, recordedClip, onActivity]);
  useEffect(() => {
    alive.current = true;
    const epochRef = operationEpoch;
    let cancelled = false;
    try { cancelledUploads.current = new Set(JSON.parse(localStorage.getItem('allvailable.cancelledUploads') ?? '[]')); } catch {}
    transport('/api/calendar-imports').then(async r => {
      if (!r.ok) { if (!cancelled) setWebAudioAvailable(false); return; }
      const body = await r.json() as { imports?: (ImportData & {id:string;gathering_id?:string;expires_at:string;idempotency_key?:string})[]; webAudioAvailable?: boolean };
      if (!cancelled) setWebAudioAvailable(body.webAudioAvailable === true);
      const saved = body.imports?.find(item => !cancelledUploads.current.has(item.idempotency_key ?? '') && (gatheringId ? item.gathering_id === gatheringId : !item.gathering_id));
      if (!cancelled && saved && !pending.current && !mutex.current) setData({ ...saved, importId: saved.id, version: String(saved.version), expiresAt: saved.expires_at });
    }).catch(() => { if (!cancelled) setWebAudioAvailable(false); });
    return () => { cancelled = true; alive.current = false; ++epochRef.current; uploadController.current?.abort(); capture.current?.cancel(); speech.current?.stop(); };
  }, [gatheringId, transport]);
  async function request<T = Record<string, unknown>>(path: string, body?: unknown, method = 'POST') {
    const r = await transport(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await r.json() as T & {error?:{message?:string}};
    if (!r.ok) throw new Error(result.error?.message ?? t('操作失敗，請重試', 'Request failed. Please retry.'));
    return result;
  }
  async function run(action: () => Promise<void>) {
    if (mutex.current || capture.current?.isActive()) return;
    const operation = ++operationEpoch.current;
    mutex.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { if (alive.current && operation === operationEpoch.current) setError(e instanceof Error ? e.message : t('操作失敗', 'Request failed')); }
    finally { if (operation === operationEpoch.current) { mutex.current = false; if (alive.current) setBusy(false); } }
  }
  async function upload(form?: FormData) {
    if (mutex.current || capture.current?.isActive()) return;
    if (form) { if (gatheringId) form.set('gatheringId', gatheringId); pending.current = { form, key: crypto.randomUUID() }; setCanRetry(true); }
    const item = pending.current; if (!item) return;
    const controller = new AbortController();
    uploadController.current = controller; setUploading(true);
    await run(async () => {
      const r = await transport('/api/calendar-imports', { method: 'POST', headers: { 'Idempotency-Key': item.key }, body: item.form, signal: controller.signal });
      const body = await r.json() as ImportData & {error?:{message?:string}};
      if (!r.ok) throw new Error(body.error?.message ?? t('上傳失敗，檔案已保留', 'Upload failed. Your files are retained.'));
      if (!alive.current || controller.signal.aborted) return;
      setData(body); setPreview(null); setSelected([]); setAnswers({}); pending.current = null; setCanRetry(false);
      const first = body.extraction.visibleRanges?.[0];
      if (!dateStart && first) setRange({ startDate: first.startDate, endDate: first.endDate });
    });
    if (uploadController.current === controller) { uploadController.current = null; if (alive.current) setUploading(false); }
  }
  function cancelUpload() {
    ++operationEpoch.current;
    uploadController.current?.abort(); uploadController.current = null;
    mutex.current = false; setUploading(false); setBusy(false); setError('');
    if (pending.current) {
      cancelledUploads.current.add(pending.current.key);
      try { localStorage.setItem('allvailable.cancelledUploads', JSON.stringify([...cancelledUploads.current].slice(-100))); } catch {}
    }
    pending.current = null; setCanRetry(false);
  }
  function cancelRecording() { capture.current?.cancel(); speech.current?.stop(); speech.current=null; confirmOnStop.current=false; setRecordedClip(null); setLiveTranscript(''); setRecording(false); setCaptureStarting(false); setRecordingQuestion(undefined); }
  async function record(questionId?: string) {
    if (mutex.current) return;
    if (recording) { if (recordingQuestion === questionId) capture.current?.stop(); return; }
    if (capture.current?.isActive()) return;
    if (!webAudioAvailable) { setError(t('網頁語音尚未設定，請使用文字。', 'Web voice is not configured. Enter text instead.')); return; }
    capture.current ??= createAudioCapture();
    setCaptureStarting(true); setRecordingQuestion(questionId); setError(''); setLiveTranscript(''); setCaptionUnavailable(false); setRecordedClip(null); confirmOnStop.current=false;
    try {
      await capture.current.start((blob, mime) => {
        if (!alive.current) return;
        setRecording(false); setCaptureStarting(false); setRecordingQuestion(undefined);
        speech.current?.stop(); speech.current=null;
        const clip={blob,mime,questionId};
        if(confirmOnStop.current){confirmOnStop.current=false;sendRecording(clip);}else setRecordedClip(clip);
      }, () => { if (alive.current) {
        setCaptureStarting(false); setRecording(true);
        speech.current = startLiveSpeech(language === 'zh' ? 'zh-TW' : 'en-US', setLiveTranscript, () => setCaptionUnavailable(true));
      } });
    } catch { if (alive.current) { setCaptureStarting(false); setRecordingQuestion(undefined); setError(t('無法使用麥克風，請上傳圖片或手動填寫。', 'Microphone unavailable. Upload a screenshot or enter times manually.')); } }
  }
  function sendRecording(clip:{blob:Blob;mime:string;questionId?:string}) {
    setRecordedClip(null);
    const {blob,mime,questionId}=clip;
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
  }
  function confirmRecording() {
    if(recording){confirmOnStop.current=true;capture.current?.stop();}
    else if(recordedClip)sendRecording(recordedClip);
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
  const eventReady = Boolean(activeEvent && (activeEvent.intent==='available'||activeEvent.label?.trim()) && !globalQuestions.length && activeEvent.startDate && activeEvent.endDate && activeEvent.sourceTimezone && eventHasExactTime && !activeEvent.unresolved.length && !activeQuestions.length && ['busy','available','tentative','uncertain'].includes(activeEvent.intent));
  function confirmEvent() {
    if (!activeEvent || !eventReady || !data) return;
    void run(async () => {
      const candidate={...activeEvent,intent:activeEvent.intent==='uncertain'?'busy' as const:activeEvent.intent,userConfirmed:true};
      let changes:Preview['changes']=[];
      if(onCardApplied){
        const single={...data.extraction,events:[candidate],questions:[]};
        const calculated=buildPreview(single,{...range,currentCells,slotStart:dailyStart,slotEnd:dailyEnd});
        if(calculated.blockedImport||calculated.blockedReview)throw new Error(t('請先補齊卡片資料','Complete the card details first.'));
        const inRange=candidate.startDate!<=range.endDate&&candidate.endDate!>=range.startDate;
        if(!inRange)throw new Error(t('日期不在邀約範圍內，請編輯卡片。','Outside invitation dates. Edit the card.'));
        changes=calculated.changes;
        if(!changes.length)throw new Error(t('這張卡片沒有可新增的時段：請檢查時間，或略過已填好的項目。','No new slots in this window. Edit the time or skip an already filled item.'));
      }
      const body=await request<ImportData>(`/api/calendar-imports/${data.importId}`,{action:'edit_event',version:data.version,eventId:activeEvent.id,changes:{reviewed:true}});
      const nextData={...data,...body,version:String(body.version)};
      if(onCardApplied){const next={...currentCells};changes.forEach(c=>{next[c.key]=c.after as Cells[string];});onCardApplied(next);}
      setData(nextData);setPreview(null);setEditingCard(false);
      if(onCardApplied&&nextData.extraction.events.every(e=>e.userConfirmed)){
        await request(`/api/calendar-imports/${data.importId}`,undefined,'DELETE');setData(null);
      }
    });
  }
  function editCard(){if(!activeEvent)return;setCardFields({title:activeEvent.label??'',date:activeEvent.startDate??'',endDate:activeEvent.endDate??'',startTime:activeEvent.startTime??'',endTime:activeEvent.endTime??'',sourceTimezone:activeEvent.sourceTimezone??'Asia/Taipei',intent:['available','tentative','busy'].includes(activeEvent.intent)?activeEvent.intent:'busy',allDay:activeEvent.allDay===true});setEditingCard(true);}
  function saveCard(){if(!data||!activeEvent)return;void run(async()=>{
    if(cardFields.endDate<cardFields.date)throw new Error(t('結束日期不可早於開始','End date must not precede start.'));
    if(!cardFields.allDay&&`${cardFields.endDate}T${cardFields.endTime}`<=`${cardFields.date}T${cardFields.startTime}`)throw new Error(t('結束須晚於開始','End must be after start.'));
    const body=await request<ImportData>(`/api/calendar-imports/${data.importId}`,{action:'edit_event',version:data.version,eventId:activeEvent.id,changes:{...cardFields,...(cardFields.allDay?{startTime:undefined,endTime:undefined}:{}),reviewed:false}});
    setData({...data,...body,version:String(body.version)});setEditingCard(false);setPreview(null);
  });}
  function skipEvent() {
    if (!data || !activeEvent) return;
    void run(async () => {
      const body = await request<ImportData>(`/api/calendar-imports/${data.importId}`, { action: 'edit_event', version: data.version, eventId: activeEvent.id, changes: { delete: true } });
      setData({ ...data, ...body, version: String(body.version) });
      setPreview(null); setEditingCard(false);
      if(onCardApplied && body.extraction.events.every(e=>e.userConfirmed)){await request(`/api/calendar-imports/${data.importId}`,undefined,'DELETE');setData(null);}
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
  return <section ref={panel} className={"import-panel" + (compact ? " import-compact" : "")} aria-label={t('提供與確認時間', 'Provide and review availability')}>
    {!compact && <><h2>{t('你什麼時候有空？', 'When are you free?')}</h2><p>{t('選一種方式新增空檔，再確認並提交。', 'Choose a way to add your times, then review and submit.')}</p></>}
    {!data && !recordedClip && sampleUploadLabel && transport !== browserImportTransport ? <button disabled={interactionLocked} onClick={() => upload(new FormData())}>{sampleUploadLabel}</button> : !data && !recordedClip && <div className="import-inputs availability-methods">
      <label className="upload-tile screenshot-entry"><ImagePlus size={24} aria-hidden="true"/><strong>{t('上傳截圖', 'Upload screenshot')}</strong>{!compact && <span>{t('行事曆或有日期的清單', 'Calendar or dated list')}</span>}<input aria-label={t('上傳截圖', 'Upload screenshot')} type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={interactionLocked} onChange={e => { const form = new FormData(); Array.from(e.target.files ?? []).forEach(f => form.append('images', f)); if (e.target.files?.length) void upload(form); e.target.value = ''; }} /></label>
      {webAudioAvailable === true && <div className="voice-entry"><button type="button" disabled={busy || captureStarting} className="upload-tile" onClick={() => record()}><Mic size={24} aria-hidden="true"/><strong>{recording ? t('停止錄音', 'Stop recording') : t('用語音說', 'Record voice')}</strong>{!compact && <span>{t('例如：週六晚上七點到九點有空', '“Saturday, 7 to 9 pm works.”')}</span>}</button></div>}
      {onManualEntry && <button type="button" className="upload-tile" disabled={interactionLocked} onClick={onManualEntry}><Clock3 size={24} aria-hidden="true"/><strong>{t('手動選時段', 'Choose times')}</strong><span>{t('選日期、開始與結束', 'Pick a day, start and end')}</span></button>}
    </div>}
    {!data && <p className="import-entry-note">{compact ? t('或直接在下方選時段。', 'Or choose your times below.') : t('截圖：最多 5 張、每張 5 MB。私人行程不公開。', 'Screenshots: up to 5 × 5 MB. Calendar details stay private.')}</p>}
    {(recording || captureStarting || recordedClip) && <section className="live-voice-panel" aria-label={t('語音逐字稿','Live transcript')}>
      <p role="status">{captureStarting?t('正在開啟麥克風…','Opening microphone…'):recording?t('正在聽…','Listening…'):t('錄音已停止，確認後產生卡片','Recording stopped. Confirm to create cards.')}</p>
      <p className="live-transcript" aria-live="polite">{liveTranscript || (captionUnavailable?t('此瀏覽器無即時字幕。確認後會辨識錄音。','Live captions unavailable in this browser. Confirm to transcribe the recording.'):t('你說的話會出現在這裡…','Your words appear here…'))}</p>
      <div className="dining-actions"><button type="button" onClick={cancelRecording}>{t('取消','Cancel')}</button><button type="button" className="dining-primary" disabled={captureStarting||busy} onClick={confirmRecording}>{t('確認並產生卡片','Confirm recording')}</button></div>
    </section>}
    {busy && <div className="dining-actions"><p role="status">{t('正在處理…', 'Processing…')}</p>{uploading && <button type="button" onClick={cancelUpload}>{t('取消', 'Cancel')}</button>}</div>}
    {error && <div role="alert" className="dining-message">{error}{canRetry && <button disabled={interactionLocked} onClick={() => upload()}>{t('重試上傳', 'Retry upload')}</button>}</div>}
    {data && <>{data.extraction.transcript && <details className="voice-transcript"><summary>{t('語音逐字稿', 'Transcript')}</summary><p>{data.extraction.transcript}</p></details>}<p className="dining-eyebrow">02 / {t('確認辨識', 'REVIEW')}</p>
      {data.status === 'rejected' ? <p>{t('沒有辨識到日期或空檔，請重試或直接選時段。', 'No dates or availability recognized. Try again or choose times below.')}</p> : <>
        {globalQuestions.map(q => <div className="clarify-field" key={q.id}><label htmlFor={`answer-${q.id}`}>{language === 'zh' ? q.prompt : ({title:'Confirm the item name.',date:'Confirm the full date (including year).',time:'Confirm start and end times.',all_day:'Is this all day, or should it have exact times?',timezone:'Confirm the IANA timezone (e.g. Asia/Taipei).',intent:'Clarify what this item means.',range:'Confirm the date range.'}[q.kind])}</label><input id={`answer-${q.id}`} disabled={interactionLocked} value={answers[q.id] ?? ''} placeholder={q.kind === 'date' ? 'YYYY-MM-DD' : q.kind === 'time' ? '18:00-20:00' : t('輸入答案', 'Your answer')} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} /><div className="dining-actions">{q.options?.map(o => <button disabled={interactionLocked} key={o} onClick={() => clarify(q.id, o)}>{o}</button>)}{webAudioAvailable && <button disabled={busy || captureStarting || (recording && recordingQuestion !== q.id)} onClick={() => record(q.id)}>{recording ? t('停止語音回答','Stop recording') : t('用語音回答','Answer by voice')}</button>}<button disabled={interactionLocked || !answers[q.id]?.trim()} onClick={() => clarify(q.id, answers[q.id])}>{t('確認答案', 'Confirm answer')}</button></div></div>)}
        {activeEvent ? <SwipeReviewCard key={activeEvent.id} remaining={eventQueue.length} disabled={interactionLocked||editingCard} canConfirm={eventReady} onConfirm={confirmEvent} onSkip={skipEvent} onEdit={editCard}><article className="event-review-card" aria-live="polite">
          <p className="dining-eyebrow">{t('逐筆確認', 'ONE AT A TIME')} · {data.extraction.events.length - eventQueue.length + 1}/{data.extraction.events.length}</p>
          <h3 ref={cardHeading} tabIndex={-1}>{activeEvent.label ?? t('未命名事項', 'Untitled item')}</h3>
          <p>
            {activeEvent.startDate ?? t('日期待確認', 'Date needed')}
            {activeEvent.allDay ? <> · {t('全天', 'All day')}{activeEvent.endDate !== activeEvent.startDate && <> → {activeEvent.endDate ?? t('結束日期待確認', 'End date needed')}</>}</> : <> · {activeEvent.startTime ?? '—'} → {activeEvent.endDate !== activeEvent.startDate && <>{activeEvent.endDate ?? t('結束日期待確認', 'End date needed')} · </>}{activeEvent.endTime ?? '—'}</>}
            <br />{activeEvent.sourceTimezone ?? t('時區待確認', 'Timezone needed')} · {activeEvent.intent === 'reminder' ? t('提醒', 'Reminder') : activeEvent.intent === 'uncertain' ? t('確認後標為忙碌', 'Confirm as busy') : status(activeEvent.intent === 'available' ? 'green' : activeEvent.intent === 'tentative' ? 'yellow' : 'red')}
          </p>
          <p>{t('右滑確認，將這段時間加入表格；重疊時段會更新。尚未儲存或提交。', 'Swipe right to add these times, replacing overlapping entries. Save and submit when ready.')}</p>
          {activeQuestions.map(q => <div className="clarify-field" key={q.id}><label htmlFor={`answer-${q.id}`}>{language === 'zh' ? q.prompt : ({title:'Confirm the item name.',date:'Confirm the full date (including year).',time:'Confirm start and end times.',all_day:'Is this all day, or should it have exact times?',timezone:'Confirm the IANA timezone (e.g. Asia/Taipei).',intent:'Are you busy, tentative or available?',range:'Confirm the date range.'}[q.kind])}</label><input id={`answer-${q.id}`} disabled={interactionLocked} value={answers[q.id] ?? ''} placeholder={q.kind === 'date' ? 'YYYY-MM-DD' : q.kind === 'time' ? '18:00-20:00' : t('輸入答案', 'Your answer')} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} /><div className="dining-actions">{q.options?.map(o => <button disabled={interactionLocked} key={o} onClick={() => clarify(q.id, o)}>{t(o, ({'真的全天不能':'Busy all day','指定起訖':'Specify exact times','只是提醒不占時間':'Reminder only','暫時未知':'Not sure yet','不能參加':'Busy','可能有事':'Tentative','可以參加':'Available'} as Record<string,string>)[o] ?? o)}</button>)}{webAudioAvailable && <button disabled={busy || captureStarting || (recording && recordingQuestion !== q.id)} onClick={() => record(q.id)}>{recording ? t('停止語音回答','Stop recording') : t('用語音回答','Answer by voice')}</button>}<button disabled={interactionLocked || !answers[q.id]?.trim()} onClick={() => clarify(q.id, answers[q.id])}>{t('確認答案', 'Confirm answer')}</button></div></div>)}
          {editingCard && <form className="card-edit-form" onSubmit={e=>{e.preventDefault();saveCard();}}>
            {(['title','date','endDate','startTime','endTime','sourceTimezone'] as const).map(field=><label key={field}>{({title:t('名稱','Name'),date:t('日期','Date'),endDate:t('結束日期','End date'),startTime:t('開始','From'),endTime:t('結束','Until'),sourceTimezone:t('時區','Timezone')})[field]}<input required disabled={busy||(cardFields.allDay&&(field==='startTime'||field==='endTime'))} type={field==='date'||field==='endDate'?'date':field==='startTime'||field==='endTime'?'time':'text'} value={cardFields[field]} onChange={e=>setCardFields({...cardFields,[field]:e.target.value})}/></label>)}
            <label>{t('狀態','Status')}<select value={cardFields.intent} onChange={e=>setCardFields({...cardFields,intent:e.target.value})}><option value="available">Available</option><option value="tentative">Tentative</option><option value="busy">Busy</option></select></label>
            <label><input type="checkbox" checked={cardFields.allDay} onChange={e=>setCardFields({...cardFields,allDay:e.target.checked})}/>{t('全天','All day')}</label>
            <div className="dining-actions"><button type="button" disabled={busy} onClick={()=>setEditingCard(false)}>{t('取消編輯','Cancel edit')}</button><button type="submit" disabled={busy}>{t('儲存卡片','Save card')}</button></div>
          </form>}
        </article></SwipeReviewCard> : <p ref={reviewSummary} tabIndex={-1} role="status" className="dining-message">{data.extraction.events.length ? t('所有項目已確認，請預覽變更。', 'Every item is reviewed. Preview your changes.') : t('已全部略過，表格沒有變更。可結束匯入。', 'All items skipped. Your grid is unchanged. Close this import to start again.')}</p>}
        {!onCardApplied && !preview && <><div className="dining-form"><label>{t('日期從', 'From date')}<input type="date" disabled={interactionLocked} min={dateStart} max={dateEnd} value={range.startDate} onChange={e => setRange({ ...range, startDate: e.target.value })} /></label><label>{t('日期到', 'To date')}<input type="date" disabled={interactionLocked} min={dateStart} max={dateEnd} value={range.endDate} onChange={e => setRange({ ...range, endDate: e.target.value })} /></label></div><p>{t('空白不代表有空。', 'Blank ≠ available.')}</p><button disabled={interactionLocked || eventQueue.length > 0 || !data.extraction.events.length || !!data.extraction.questions.length || !range.startDate || !range.endDate} onClick={makePreview}>{t('預覽時段變更', 'Preview')}</button></>}
        {preview && <><p>{t('預設只選未填格，勾選其他格才會覆蓋。', 'Select changes to apply. Existing entries are unchecked.')}</p><div className="import-change-list">{preview.changes.map(c => <label key={c.key}><input type="checkbox" disabled={interactionLocked} checked={selected.includes(c.key)} onChange={e => setSelected(old => e.target.checked ? [...old, c.key] : old.filter(k => k !== c.key))} />{c.key} · {status(c.before)} → {status(c.after)}</label>)}</div>{!preview.changes.length && <p>{t('這個範圍沒有變更。', 'No changes within this range.')}</p>}<div className="dining-actions"><button disabled={interactionLocked} onClick={() => setPreview(null)}>{t('返回／重新預覽', 'Back / refresh preview')}</button><button className="dining-primary" disabled={interactionLocked || !selected.length} onClick={apply}>{t('確認加入草稿', 'Save to draft')}</button></div></>}
      </>}
      <button disabled={interactionLocked} onClick={() => run(async () => { await request(`/api/calendar-imports/${data.importId}`, undefined, 'DELETE'); setData(null); setPreview(null); setAnswers({}); setSelected([]); })}>{t('結束這次匯入', 'Close import')}</button>
    </>}
  </section>;
}
