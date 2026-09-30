"use client";
import { useEffect, useState } from 'react';
import NavigationMenu from './NavigationMenu';
import ImportPanel from '@/components/calendar-import/ImportPanel';
import AvailabilityEditor from './AvailabilityEditor';
import { useLanguage } from './Language';
import { createLocalImportPreview, LOCAL_IMPORT_KEY, SAMPLE_RANGE } from '@/lib/calendar/local-import-preview';
import './dining.css';
import './workflow.css';
import './preview.css';

type Session = ReturnType<typeof createLocalImportPreview>;
export default function LocalWorkflowPreview() {
  const { t } = useLanguage();
  const [canvas, setCanvas] = useState<boolean | null>(null);
  const [mobile, setMobile] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setCanvas(new URLSearchParams(window.location.search).has('canvas')), 0); return () => clearTimeout(timer); }, []);
  if (canvas === null) return <p role="status">Loading local preview…</p>;
  if (canvas) return <PreviewCanvas />;
  return <main className="dining preview-shell">
    <h1>{t('本機流程驗收', 'Local workflow acceptance')}</h1>
    <p>{t('合成資料，未呼叫 AI。只存在此瀏覽器；不會提交給朋友。', 'Synthetic data · No AI calls · Stored only in this browser · Not submitted to friends.')}</p>
    <div className="dining-actions"><button aria-pressed={!mobile} onClick={() => setMobile(false)}>Desktop</button><button aria-pressed={mobile} onClick={() => setMobile(true)}>390px mobile</button></div>
    <iframe title="Synthetic review and availability workflow" src="/preview?canvas=1" className="preview-frame" style={{ width: mobile ? 390 : '100%' }} />
  </main>;
}
function PreviewCanvas() {
  const { t } = useLanguage();
  const [session, setSession] = useState<Session | null>(null);
  const [, redraw] = useState(0);
  const [panelKey, setPanelKey] = useState(0);
  const [active, setActive] = useState(false);
  const [notice, setNotice] = useState('');
  const [viewport, setViewport] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      try { setSession(createLocalImportPreview(localStorage, () => redraw(n => n + 1))); }
      catch { setNotice('Local fixture storage is unavailable or invalid. Reset local sample to recover.'); }
    }, 0);
    const measure = () => setViewport(`${window.innerWidth}px · ${document.documentElement.scrollWidth > window.innerWidth ? 'horizontal overflow' : 'no horizontal overflow'}`);
    const observer = new ResizeObserver(measure); observer.observe(document.documentElement);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, []);
  function reset() {
    try {
      session?.dispose();
      localStorage.removeItem(LOCAL_IMPORT_KEY);
      setSession(createLocalImportPreview(localStorage, () => redraw(n => n + 1)));
      setPanelKey(n => n + 1); setNotice('');
    } catch { setNotice('Browser storage is unavailable. Enable local storage to use this preview.'); }
  }
  const state = session?.snapshot();
  return <main className="dining workflow-detail preview-canvas">
    <header className="dining-nav"><span className="dining-brand">Allvailable</span><NavigationMenu accountEnabled={false} /></header>
    <h1>{t('逐項確認你的時間', 'Review your times')}</h1>
    <p className="dining-message">{t('合成範例 · 沒有 AI 呼叫 · 沒有提交', 'Synthetic sample · No AI calls · No submission')}</p>
    <details className="preview-controls"><summary>{t('驗收控制', 'Acceptance controls')}</summary>
      <p>{viewport}</p><p>{t('略過報告與買票。晚餐填 19:00-20:30，確認並預覽後儲存。應只有三格忙碌。', 'Skip the report and ticket. Enter 19:00-20:30 for dinner, confirm, preview and save. Expect exactly three busy cells.')}</p>
      <div className="dining-actions"><button onClick={reset}>{t('重設本機範例', 'Reset local sample')}</button><button disabled={!session} onClick={() => { session?.failNext(); setNotice(t('下一次操作將模擬失敗，可直接重試。', 'Next action will fail once; retry it to recover.')); }}>{t('下一次操作失敗', 'Fail next action')}</button></div>
    </details>
    {notice && <p role="status">{notice}</p>}
    {session && state && <div className="preview-workspace">
      <ImportPanel key={panelKey} transport={session.transport} sampleUploadLabel={t('載入三張合成卡片', 'Load three sample cards')} gatheringId="synthetic-gathering" dateStart={SAMPLE_RANGE.startDate} dateEnd={SAMPLE_RANGE.endDate} draftVersion={state.version} currentCells={state.cells} onActivity={setActive} onApplied={() => setNotice(t('已儲存本機草稿，尚未提交。', 'Local draft saved. Not submitted.'))} />
      <section className="manual-panel"><h2>{t('我的半小時表格', 'My half-hour grid')}</h2><p>{t('時間以 Asia/Taipei 顯示；空白不是有空。', 'Times in Asia/Taipei. Blank does not mean available.')}</p>
        <AvailabilityEditor dateStart={SAMPLE_RANGE.startDate} dateEnd={SAMPLE_RANGE.endDate} dailyStart="18:00" dailyEnd="22:00" cells={state.cells} disabled={active} onChange={cells => { try { session.setCells(cells); } catch { setNotice('Could not save the local grid.'); } }} />
        <p role="status">{t('忙碌格數', 'Busy cells')}: {Object.values(state.cells).filter(value => value === 'red').length}</p>
      </section>
    </div>}
  </main>;
}
