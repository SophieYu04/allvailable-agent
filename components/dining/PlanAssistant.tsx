"use client";
import { apiFetch } from '@/lib/api-fetch';
import { useRef, useState } from 'react';
import { useLanguage } from './Language';

export type PlanDraft = { name: string | null; dateStart: string | null; dateEnd: string | null; dailyStart: string | null; dailyEnd: string | null; duration: number | null; deadline: string | null };

/** A saved proposal only fills the review form. It cannot publish or submit availability. */
export default function PlanAssistant({ onDraft, disabled, onBusyChange }: { onBusyChange: (busy: boolean) => void; onDraft: (draft: PlanDraft) => void; disabled: boolean }) {
  const { t } = useLanguage();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  const request = useRef<{ text: string; key: string } | null>(null);
  async function prepare() {
    if (pending.current || !text.trim()) return;
    pending.current = true; setBusy(true); onBusyChange(true); setMessage('');
    if (request.current?.text !== text) request.current = { text, key: crypto.randomUUID() };
    try {
      const response = await apiFetch('/api/v1/coordination/proposals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, requestKey: request.current!.key }) });
      const result = await response.json() as { proposal?: { input: PlanDraft; questions?: string[] } };
      if (!response.ok || !result.proposal?.input) {
        if (response.status === 429) throw new Error(t('今天的 AI 額度已用完，仍可用下方表單建立。', 'Today’s AI limit is reached. You can still use the form below.'));
        throw new Error(t('暫時無法整理，描述已保留。可重試或用下方表單建立。', 'Unable to prepare your draft. Your description is saved here; retry or use the form below.'));
      }
      onDraft(result.proposal.input);
      setMessage(result.proposal.questions?.length
        ? t('已整理明確的條件。請在下方補齊空白欄位，再檢查草稿。', 'The details you gave are ready below. Complete the empty fields and review your draft.')
        : t('草稿已準備好。請檢查下方條件後儲存。', 'Your draft is ready below. Review the details before saving.'));
    } catch (error) { setMessage(error instanceof Error ? error.message : t('請稍後重試。', 'Please retry.')); }
    finally { pending.current = false; setBusy(false); onBusyChange(false); }
  }
  return <section className="plan-assistant" aria-labelledby="plan-assistant-heading">
    <h3 id="plan-assistant-heading">{t('說說你的計畫', 'Describe your plan')}</h3>
    <label htmlFor="plan-description" className="dining-note">{t('日期、時段、活動長度，以及希望大家何時回覆。', 'Include dates, a time window, duration, and a reply deadline.')}</label>
    <textarea id="plan-description" rows={4} maxLength={6000} value={text} disabled={busy || disabled} onChange={e => setText(e.target.value)} placeholder={t('例如：下週六朋友聚餐，晚上六點到十點之間，吃一小時，週五中午前回覆。', 'Dinner next Saturday, one hour between 6 and 10 pm. Reply by Friday at noon.')} />
    <button type="button" className="dining-primary" disabled={busy || disabled || !text.trim()} onClick={() => void prepare()}>{busy ? t('正在整理…', 'Preparing…') : t('整理成草稿', 'Prepare draft')}</button>
    <p className="dining-note">{t('AI 只整理邀約條件。朋友的空檔由本人確認；所有時間以台灣時區顯示。', 'AI prepares the invitation. Each friend confirms their own availability. All times use Taipei time.')}</p>
    {message && <p role="status">{message}</p>}
  </section>;
}
