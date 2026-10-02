"use client";
import { appHref } from '@/lib/client-runtime';
import { apiFetch } from '@/lib/api-fetch';

import { useCallback, useEffect, useRef, useState } from "react";
import "./dining.css";
import "./workflow.css";
import GatheringManager from "./GatheringManager";
import AvailabilityEditor from "./AvailabilityEditor";
import NavigationMenu from "./NavigationMenu";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ImportPanel from "@/components/calendar-import/ImportPanel";
import { useLanguage } from "./Language";
import { candidateSummary } from "@/lib/calendar/candidate-status";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { dateList, timeList } from "@/lib/calendar/slots";
import type { Cells, SlotStatus } from "@/lib/calendar/types";

type Person = { participantId: string; displayName: string; status?: string; submitted: boolean; hasUnknown?: boolean; hasConflict?: boolean };
type Candidate = { id: string; startsAt: string; endsAt: string; totalScore: number; participantScores: Person[] };
type Gathering = { id: string; name: string; date_start: string; date_end: string; daily_start: string; daily_end: string; deadline_at: string; status: string; revision: string; duration_minutes:number;recommendation_count:number;host_participates?:boolean;conditions_public?:boolean;host_name?:string;host_id?: string; invite_token?: string; join_code?: string;
  memberships?: Array<{ user_id: string; display_name: string; status: string;is_priority?:boolean }>;
  availability_submissions?: Array<{ user_id: string }>;
  result_snapshots?: Array<{ id: string; revision: string; candidates: Candidate[] }>;
  finalizations?: Array<{ snapshot_id: string; candidate_id: string }> };

const stamp = (value: string) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));

class DiningError extends Error { constructor(message:string, readonly status:number){super(message);} }

async function api(path: string, method = "GET", body?: unknown) {
  const response = await apiFetch(path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json() as { error?: { message?: string }; gathering: Gathering; version: string; draftVersion: string; changes: Array<{key:string;before:SlotStatus;after:SlotStatus}>; cells: Cells };
  if (!response.ok) throw new DiningError(data.error?.message ?? "操作失敗，請重試", response.status);
  return data;
}

export default function DiningDetail({ token, gatheringId }: { token?: string; gatheringId?: string }) {
  const router=useRouter();
  const {t} = useLanguage();
  const labels: Record<SlotStatus, string> = { green: t("可以", "Available"), yellow: t("待確認", "Tentative"), red: t("不行", "Busy"), unknown: t("未填", "Unknown") };
  const [importActive, setImportActive] = useState(false);
  const [blankPreview, setBlankPreview] = useState<string[] | null>(null);
  const [gathering, setGathering] = useState<Gathering | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [accessUnavailable, setAccessUnavailable] = useState(false);
  const [joined, setJoined] = useState(false);
  const [cells, setCells] = useState<Cells>({});
  const [version, setVersion] = useState("1");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [shared, setShared] = useState<Array<{key:string;before:SlotStatus;after:SlotStatus}> | null>(null);
  const [sharedSelection, setSharedSelection] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const lock = useRef(false);
  const loadEpoch = useRef(0);
  const key = userId && gathering ? `yuema.web-draft.${userId}.${gathering.id}` : null;
  const locked = !gathering || ["draft", "finalized", "cancelled"].includes(gathering.status) || new Date(gathering.deadline_at).getTime() <= now;

  const load = useCallback(async (discardLocal = false) => {
    const epoch = ++loadEpoch.current;
    const client = getSupabaseBrowserClient();
    const auth = client ? await client.auth.getUser() : null;
    if (epoch !== loadEpoch.current) return;
    const id = auth?.data.user?.id ?? null;
    setUserId(id);
    setAuthChecked(true);
    setAccessUnavailable(false);
    if (!id) { setGathering(null); setJoined(false); setCells({}); setMessage(t('請先登入以開啟邀請。', 'Sign in to open this invitation.')); return; }
    const summary = await api(gatheringId ? `/api/v1/coordination/${encodeURIComponent(gatheringId)}` : `/api/v1/join/${encodeURIComponent(token ?? "")}`).catch(error => {
      if (epoch === loadEpoch.current && error instanceof DiningError && [403,404].includes(error.status)) {
        setGathering(null); setJoined(false); setCells({}); setAccessUnavailable(true);
        throw new Error(t('你已登入，但此帳戶無法開啟這筆邀請。請向主揪索取分享連結或六位數邀請碼。', 'You are signed in, but this invitation is unavailable to your account. Ask the host for a share link or six-digit code.'));
      }
      throw error;
    });
    if (epoch !== loadEpoch.current) return;
    setGathering(summary.gathering);
    const response = await apiFetch(`/api/v1/coordination/${summary.gathering.id}`);
    if (epoch !== loadEpoch.current) return;
    if (response.status === 404 || response.status === 403) { setJoined(false); return; }
    if (!response.ok) throw new Error(t("邀約載入失敗，請重試", "Unable to load invitation. Retry."));
    const details = ((await response.json()) as { gathering: Gathering }).gathering;
    if (epoch !== loadEpoch.current) return;
    const member = details.memberships?.some((m) => m.user_id === id && m.status === "joined");
    setJoined(Boolean(member));
    setGathering(details);
    if (!member) { setCells({}); return; }
    const draft = await api(`/api/v1/coordination/${details.id}/draft`);
    if (epoch !== loadEpoch.current) return;
    setVersion(String(draft.version));
    setCells(draft.cells);
    setConflict(false);
    const storageKey = `yuema.web-draft.${id}.${details.id}`;
    try {
      if (discardLocal) localStorage.removeItem(storageKey);
      const local = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (local) {
        setCells(local.cells);
        setVersion(String(local.version));
        setConflict(String(local.version) !== String(draft.version));
        setMessage(String(local.version) !== String(draft.version) ? t("另一裝置已更新。你的本機填寫保留中，請重新載入後再修改。", "Another device updated this draft. Your local input is retained. Reload to continue.") : t("已恢復本機草稿，尚未提交", "Local draft restored. Not submitted yet."));
      }
    } catch { setMessage(t("瀏覽器無法保存本機草稿，請保持此頁開啟", "Local storage is unavailable. Keep this page open.")); }
  }, [token, gatheringId, t]);

  useEffect(() => {
    let active = true;
    const epochRef = loadEpoch;
    const timer = window.setTimeout(() => { if (active) void load().catch((e) => setMessage(e.message)); }, 0);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const client = getSupabaseBrowserClient();
    const listener = client?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { ++loadEpoch.current; setUserId(null); setJoined(false); setCells({}); setGathering(null); }
    });
    return () => { ++epochRef.current; active = false; clearTimeout(timer); clearInterval(tick); listener?.data.subscription.unsubscribe(); };
  }, [load]);

  function edit(next: Cells) {
    if (locked || working || conflict || importActive) return;
    setShared(null);
    setCells(next);
    setMessage(t("本機草稿，尚未提交", "Local draft, not submitted."));
    if (key) try { localStorage.setItem(key, JSON.stringify({ cells: next, version })); } catch { setMessage(t("本機儲存失敗，請保持此頁開啟並儲存草稿", "Local save failed. Keep this page open and save your draft.")); }
  }
  async function act(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setWorking(true); setMessage("");
    try { await action(); } catch (error) { if(error instanceof DiningError && error.status===409){setConflict(true);} setMessage(error instanceof Error ? error.message : t("操作失敗，輸入已保留", "Request failed. Your input is retained.")); }
    finally { lock.current = false; setWorking(false); }
  }
  async function save(submit: boolean) {
    if (!gathering || locked || conflict || importActive) return;
    const dates = dateList(gathering.date_start, gathering.date_end);
    const times = timeList(gathering.daily_start.slice(0, 5), gathering.daily_end.slice(0, 5));
    if (submit && dates.some((date) => times.some((time) => !cells[`${date}-${time}`] || cells[`${date}-${time}`] === "unknown")) && !confirm(t("仍有未填時段，將以 0 分計算。確定提交？", "Some slots are unknown and will not count as available. Submit?"))) return;
    await act(async () => {
      const draft = await api(`/api/v1/coordination/${gathering.id}/draft`, "PATCH", { expectedVersion: version, cells });
      setVersion(String(draft.version));
      if (key) try { localStorage.setItem(key, JSON.stringify({ cells, version: String(draft.version) })); } catch {}
      if (submit) {
        const changes = Object.entries(cells).map(([key, status]) => ({ date: key.slice(0, 10), minute: Number(key.slice(11, 13)) * 60 + Number(key.slice(14)), status }));
        await api(`/api/v1/coordination/${gathering.id}/submit`, "POST", { expectedDraftVersion: String(draft.version), cells, changes });
        if (key) try { localStorage.removeItem(key); } catch {}
        await load(); setMessage(t("已正式提交", "Availability submitted."));
      } else setMessage(t("雲端草稿已儲存，尚未正式提交", "Draft saved to the cloud. Not submitted yet."));
    });
  }

  const snapshot = gathering?.result_snapshots?.[0];
  const finalization = gathering?.finalizations?.find((f) => f.snapshot_id === snapshot?.id);
  const times = gathering ? timeList(gathering.daily_start.slice(0, 5), gathering.daily_end.slice(0, 5)) : [];
  return <main className="dining workflow-detail"><section className="dining-detail">
    <div className="dining-nav"><Link href="/" className="dining-back">← {t("我的邀約", "My invitations")}</Link><NavigationMenu/></div>
    <h1>{gathering?.name ?? (message ? t("無法載入邀約", "Invitation unavailable") : t("邀請載入中", "Loading invitation…"))}</h1>
    {message && <div className="dining-message" role="status">{message}{!gathering && <button onClick={() => void load().catch(e => setMessage(e.message))}>{t("重新載入", "Retry")}</button>}</div>}
    {gathering && <p>{gathering.host_name && <>{t("主揪","Host")}: {gathering.host_name} · </>}{gathering.date_start} ～ {gathering.date_end}{t("· 回覆截止", "· Reply by")}{stamp(gathering.deadline_at)}{t("（台灣時間）", " (Taipei time)")}</p>}
    {authChecked && !userId && <Link className="button primary" href={`/login?next=${encodeURIComponent(gatheringId ? `/gatherings/${gatheringId}` : `/join/${token}`)}`}>{t("使用 Google 登入並回覆", "Sign in with Google to reply")}</Link>}
    {accessUnavailable && userId && <div className="dining-actions"><Link className="button primary" href="/">{t('回到我的聚會', 'My gatherings')}</Link><Link href="/join">{t('輸入邀請碼', 'Enter invitation code')}</Link><Link href={`/login?next=${encodeURIComponent(gatheringId ? `/gatherings/${gatheringId}` : `/join/${token}`)}`}>{t('切換 Google 帳戶', 'Use another Google account')}</Link></div>}
    {token && userId && !joined && <button className="button primary" disabled={working || locked} onClick={() => act(async () => { await api(`/api/v1/join/${encodeURIComponent(token ?? "")}`, "POST"); await load(); })}>{locked ? t("邀約已截止", "Invitation closed") : t("確認加入邀約", "Join this invitation")}</button>}
    {gathering && (joined || gathering.host_id===userId) && <>
      <GatheringManager gathering={gathering} reload={()=>load()} host={gathering.host_id===userId} expired={new Date(gathering.deadline_at).getTime()<=now} disabled={working||importActive} onLeave={()=>router.push("/")}/>
      <section className="reply-roster"><h2>{t('回覆進度','Replies')} <span>{gathering.availability_submissions?.length ?? 0}/{gathering.memberships?.filter(m=>m.status==='joined').length ?? 0}</span></h2><ul>{gathering.memberships?.filter(m=>m.status==='joined').map(m=><li key={m.user_id}><span>{m.display_name}{m.user_id===gathering.host_id?' · '+t('主揪','Host'):''}{m.user_id===userId?' · '+t('你','You'):''}</span><span>{gathering.availability_submissions?.some(s=>s.user_id===m.user_id)?t('已提交','Submitted'):t('待回覆','Pending')}</span></li>)}</ul></section>
      <div className="dining-actions">
      {gathering.join_code && gathering.status!=="draft" && <span className="gathering-join-code" aria-label={t("邀約編號","Gathering code")}>{gathering.join_code}</span>}
      <button disabled={working || importActive || gathering.status==='draft'} onClick={() => act(async () => {
        const invite = gathering.invite_token ?? token;
        if (!invite) throw new Error(t("找不到分享連結，請重新載入", "Invitation link missing. Reload."));
        const url = new URL(appHref(`/join/${encodeURIComponent(invite)}`), location.origin).href;
        if (navigator.share) await navigator.share({title:gathering.name,url});
        else { await navigator.clipboard.writeText(url); setMessage(t("邀請連結已複製", "Invitation link copied.")); }
      })}>{t("分享飯局", "Share invitation")}</button>
      {gathering.host_id === userId && !['draft','finalized','cancelled'].includes(gathering.status) && <button disabled={working || importActive} onClick={() => act(async () => { await api(`/api/v1/coordination/${gathering.id}/recalculate`, 'POST'); await load(); setMessage(t("已依最新提交計算推薦", "Recommendations updated from submitted availability.")); })}>{t("計算推薦時間", "Find shared times")}</button>}
      {gathering.host_id === userId && !['draft','finalized','cancelled'].includes(gathering.status) && <button disabled={working || importActive} onClick={() => { if(confirm(t("確定取消這場飯局？取消後無法繼續填寫或拍板。", "Cancel this invitation? Replies and finalization will be closed."))) void act(async()=>{await api(`/api/v1/coordination/${gathering.id}/cancel`, 'POST');await load();setMessage(t("飯局已取消", "Invitation cancelled."));}); }}>{t("取消飯局", "Cancel invitation")}</button>}
      <button disabled={working || importActive} onClick={() => { if (confirm(t("重新載入會取代本機尚未儲存的填寫，確定？", "Reload and replace unsaved local changes?"))) void act(() => load(true)); }}>{t("重新載入", "Reload")}</button></div>
      {!joined ? <p>{t("你目前只管理飯局。可在主揪設定選擇參加。","You are managing this gathering. Join from Host controls.")}</p> : locked ? <p>{t("填寫已鎖定 ·", "Replies closed ·")}{gathering.status === "draft" ? t("發布後即可填寫", "Publish to open replies") : gathering.status === "cancelled" ? t("已取消", "Cancelled") : gathering.status === "finalized" ? t("已拍板", "Finalized") : t("已截止", "Deadline passed")}</p> : <>
        <ol className="dining-steps"><li>01 {t('填寫我的時間','Mark my times')}</li><li>02 {t('檢查並提交','Review & submit')}</li><li>03 {t('主揪拍板','Host finalizes')}</li></ol>
        <div className="dining-workspace"><details className="optional-import"><summary>{t('匯入我的時間','Import my availability')}</summary>
        <ImportPanel gatheringId={gathering.id} dateStart={gathering.date_start} dateEnd={gathering.date_end} draftVersion={version} currentCells={cells} onActivity={setImportActive} beforePreview={async () => {
          if (locked || conflict || lock.current) throw new Error(t('請先處理草稿衝突或截止狀態','Resolve draft conflicts before previewing'));
          const saved = await api(`/api/v1/coordination/${gathering.id}/draft`, 'PATCH', {expectedVersion:version,cells});
          setVersion(String(saved.version));
          if (key) try { localStorage.setItem(key, JSON.stringify({cells,version:String(saved.version)})); } catch {}
          return String(saved.version);
        }} onApplied={(next, nextVersion) => {
          setCells(next); setVersion(nextVersion ?? version); setBlankPreview(null); setShared(null);
          if (key) try { localStorage.setItem(key,JSON.stringify({cells:next,version:nextVersion ?? version})); } catch {}
          setMessage(t('已加入草稿，請確認空檔後正式提交','Saved to draft. Review availability, then submit.'));
        }}/>
        <details className="dining-sync"><summary>{t('或帶入已同步的 App 忙碌時間','Import app calendar')}</summary><p>{t('只帶入忙碌狀態，不會公開私人活動名稱。','Only busy times are imported.')}</p><button disabled={working || conflict || importActive} onClick={()=>act(async()=>{
          const saved=await api(`/api/v1/coordination/${gathering.id}/draft`,'PATCH',{expectedVersion:version,cells});setVersion(String(saved.version));
          if(key) try {localStorage.setItem(key,JSON.stringify({cells,version:String(saved.version)}));}catch{}
          const result=await api(`/api/v1/coordination/${gathering.id}/personal-calendar`);
          if(String(result.draftVersion)!==String(saved.version)) throw new Error(t('草稿已更新，請重新載入','Draft changed. Please reload.'));
          setShared(result.changes);setSharedSelection(result.changes.filter(c=>c.before==='unknown').map(c=>c.key));
        })}>{t('預覽同步狀態','Preview synced status')}</button>{shared && <><div className="import-change-list">{shared.map(c=><label key={c.key}><input type="checkbox" checked={sharedSelection.includes(c.key)} onChange={e=>setSharedSelection(old=>e.target.checked?[...old,c.key]:old.filter(k=>k!==c.key))}/>{c.key} · {labels[c.before]} → {labels[c.after]}</label>)}</div><button disabled={working || conflict || importActive || !sharedSelection.length} onClick={()=>act(async()=>{
          const result=await api(`/api/v1/coordination/${gathering.id}/personal-calendar`,'POST',{expectedDraftVersion:version,selectedKeys:sharedSelection,expectedStatuses:Object.fromEntries(shared.filter(c=>sharedSelection.includes(c.key)).map(c=>[c.key,c.after]))});
          setCells(result.cells);setVersion(String(result.version));setShared(null);
          if(key) try {localStorage.setItem(key,JSON.stringify({cells:result.cells,version:String(result.version)}));}catch{}
          setMessage(t('已加入草稿，請確認後提交','Added to draft. Review before submitting.'));
        })}>{t('確認加入草稿','Confirm and save to draft')}</button><button onClick={()=>setShared(null)}>{t('取消','Cancel')}</button></>}</details>
        </details><section className="manual-panel"><p className="dining-eyebrow">01 / {t('確認空檔並提交','CONFIRM AND SUBMIT')}</p><h2>{t('你的空檔，由你決定。','Your availability')}</h2><p>{t('完整填色只有你看得到。只有正式提交才會計算。','Only you see this grid. Submit when ready to include your reply.')}</p>
        <AvailabilityEditor cells={cells} onChange={edit} dateStart={gathering.date_start} dateEnd={gathering.date_end} dailyStart={gathering.daily_start} dailyEnd={gathering.daily_end} disabled={working || conflict || importActive}/>
        <section className="blank-confirm"><p>{t('僅限以下範圍：','Only within:')} {gathering.date_start} → {gathering.date_end} · {gathering.daily_start.slice(0,5)}–{gathering.daily_end.slice(0,5)}</p><button disabled={working || conflict || importActive} onClick={() => setBlankPreview(dateList(gathering.date_start,gathering.date_end).flatMap(d=>times.map(time=>`${d}-${time}`)).filter(k=>!cells[k] || cells[k]==='unknown'))}>{t('此範圍其他空白都可以 → 預覽','Remaining blanks are available → Preview')}</button>{blankPreview && <><p>{blankPreview.length} {t('個未填時段將設為可以；已填時段不變。','unknown slots will become available; existing entries stay unchanged.')}</p><div className="import-change-list">{blankPreview.map(k=><p key={k}>{k} · {t('未填 → 可以','Unknown → Available')}</p>)}</div><button disabled={working || conflict || importActive} onClick={()=>{edit({...cells,...Object.fromEntries(blankPreview.filter(k=>!cells[k] || cells[k]==='unknown').map(k=>[k,'green' as const]))});setBlankPreview(null);}}>{t('確認套用到草稿','Apply to draft')}</button><button onClick={()=>setBlankPreview(null)}>{t('取消','Cancel')}</button></>}</section>
        <div className="draft-submit-actions"><button disabled={working || conflict || importActive} onClick={() => save(false)}>{t("儲存草稿", "Save draft")}</button><button className="button primary" disabled={working || conflict || importActive} onClick={() => save(true)}>{t("正式提交", "Submit")}</button></div></section></div>
      </>}
      <h2>{gathering.status === "finalized" ? t("拍板結果", "Final time") : t("推薦時間", "Suggested times")}</h2>
      {!snapshot && <p>{t('請主揪在大家提交後計算共同時間。','Waiting for submissions.')}</p>}
      {snapshot && !snapshot.candidates.some(c=>candidateSummary(c.participantScores,gathering.memberships?.filter(m=>m.status==='joined').length ?? 0).common) && <p className="dining-message">{t('尚無共同空檔。以下時段仍需確認。','No shared time yet. These options need confirmation.')}</p>}
      {snapshot && String(snapshot.revision) !== String(gathering.revision) && <p>{t("資料有更新，等待主揪重算", "New replies received. The host needs to recalculate.")}</p>}
      {snapshot?.candidates.slice(0,3).filter((c) => !finalization || c.id === finalization.candidate_id).map((c) => <article key={c.id} style={{ margin: "16px 0" }}><strong>{stamp(c.startsAt)} ～ {stamp(c.endsAt)}</strong><p className="dining-badge">{String(snapshot.revision) === String(gathering.revision) && candidateSummary(c.participantScores,gathering.memberships?.filter(m=>m.status==='joined').length ?? 0).common ? t('共同可約','All available') : t('待協調 · 非全員可約','Needs confirmation')}</p><p>{candidateSummary(c.participantScores,gathering.memberships?.filter(m=>m.status==='joined').length ?? 0).available} / {gathering.memberships?.filter(m=>m.status==='joined').length ?? 0} {t('人明確可用','confirmed available')}</p><p>{t('總分','Score')}: {c.totalScore / 2}</p><ul className="candidate-roster">{c.participantScores.map(p=><li key={p.participantId}><span>{p.displayName}</span><span>{!p.submitted ? t("未提交", "Not submitted") : p.hasConflict ? t("不行", "Unavailable") : p.hasUnknown ? t("未填", "Unknown") : p.status === 'green' ? t("可以", "Available") : p.status === 'yellow' ? t("可能有事", "Tentative") : t("需重算", "Recalculate")}</span></li>)}</ul>
        {!finalization && gathering.host_id===userId && !['finalized','cancelled'].includes(gathering.status) && <button disabled={working||importActive} onClick={()=>act(async()=>{await api('/api/v1/coordination/'+gathering.id+'/manage','POST',{action:'remove-candidate',expectedRevision:gathering.revision,idempotencyKey:crypto.randomUUID(),input:{startsAt:c.startsAt}});await load();})}>{t('移除此候選並等待重算','Remove from next calculation')}</button>}
        {!finalization && gathering.host_id === userId && !['draft','finalized','cancelled'].includes(gathering.status) && <button disabled={working || String(snapshot.revision)!==String(gathering.revision)} onClick={() => {
          const unresolved = c.participantScores.some(p=>!p.submitted || p.hasConflict || p.hasUnknown || p.status !== 'green');
          if (!confirm(unresolved ? t("此時段有不行、待確認、未填或未提交者。仍確定拍板？", "Some people are busy, tentative, unknown or have not replied. Finalize anyway?") : t("確定拍板這個吃飯時間？", "Finalize this time?"))) return;
          void act(async()=>{await api(`/api/v1/coordination/${gathering.id}/finalize`, 'POST', {snapshotId:snapshot.id,candidateId:c.id,expectedRevision:String(gathering.revision)});await load();setMessage(t("已拍板！每位成員可自行加入 App 日曆", "Finalized. Each person can add it to their app calendar."));});
        }}>{t("拍板這個時間", "Finalize this time")}</button>}
        {finalization && <button disabled={working || importActive} onClick={() => act(async () => { await api(`/api/v1/coordination/${gathering.id}/calendar-event`, "POST", { snapshotId: snapshot.id, candidateId: c.id }); setMessage(t("已加入你的Allvailable日曆", "Added to your Allvailable calendar.")); })}>{t("加入我的 App 日曆", "Add to my app calendar")}</button>}
      </article>)}
    </>}
    {(gathering?.invite_token ?? token) && <p><a href={`com.yuema.mobile://join/${encodeURIComponent(gathering?.invite_token ?? token ?? "")}`}>{t("使用 App 開啟", "Open in app")}</a></p>}
  </section></main>;
}
