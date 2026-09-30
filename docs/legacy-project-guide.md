# Earlier project setup and broader feature notes

Preserved from the root README. For the current hackathon scope and evidence, use [the root README](../README.md).

> **Hackathon web edition:** [English setup & architecture](hackathon/README.md) · [Acceptance evidence](hackathon/acceptance.md) · [Demo script & roadmap](hackathon/submission.md)

# Allvailable

目前產品範圍與既有決策請先讀 [有效需求](product-requirements.md) 及 [對話決策紀錄](product-decisions.md)：同一 App 整合 Calendar、Planner、Deadline 倒數、每日 Deadline 與 AI 揪時間。下列是現有程式與開發設定，不代表完整流程已驗收；交付證據見 [資料可靠性紀錄](calendar-reliability.md)。

以週計劃為入口的行事曆與多人約飯網站。使用者可以新增本機事件、連接外部行事曆、匯入忙碌時間，並建立飯局、分享邀請連結和協調共同時段。

## 本機啟動

需要 Node.js 22.13 或更新版本。

```bash
npm ci
npm run dev
```

開啟 `http://localhost:5173/`。沒有 Supabase 環境變數時，首頁會使用可操作的展示資料和 `localStorage`，方便先驗證手機與桌面流程。

## Supabase 設定

1. 參賽版已使用 Allvailable 專用 Supabase 專案 `mccbaouodyprmqplxeav`；不要另建專案或連到 Firstgram。
2. 將 `.env.example` 複製為 `.env.local`，填入 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。
3. 雲端已套用 21 份 migration 並部署 `calculate-results`。只有重建專案時才需完整依序套用 migrations；使用 `scripts/supabase-allvailable.sh` 隔離專用 CLI 登入。
4. `deadline-worker` 與每分鐘 Cron 尚未列入 hackathon 核心驗收；不要因此把它當成已部署。
5. 將 OAuth callback 設為 `/auth/callback`。

## 驗證

```bash
npm test
npm run lint
npm run build
```

## AI 與 Nebius Token Factory

產品內的邀約、文字與行事曆草稿解析使用 Nebius Token Factory 上的 NVIDIA Nemotron；API key 僅由服務端讀取。將 `.env.example` 複製為 `.env.local`，設定 `NEBIUS_API_KEY`、帳戶可用的 `NEBIUS_MODEL`，再設 `AI_IMPORT_ENABLED=true`。iOS TimeTree 匯入先在本機以 Apple Vision 辨識文字與位置，再交給 Nemotron 分類及抽取事件，不要求文字模型接收圖片。既有 Web 直接圖片匯入須另設定實際支援圖片的 `NEBIUS_VISION_MODEL`。

Web 語音須設定獨立的 `NEBIUS_AUDIO_API_KEY`、`NEBIUS_AUDIO_BASE_URL` 與 `NEBIUS_AUDIO_MODEL`，使用 audio transcriptions 格式。Web 圖片另選可用視覺模型並設定 `NEBIUS_VISION_MODEL`；Token Factory 文件所列圖片請求可沿用 `NEBIUS_API_KEY` 與 `NEBIUS_BASE_URL`，獨立的 `NEBIUS_VISION_API_KEY`、`NEBIUS_VISION_BASE_URL` 僅作端點覆寫。沒有 Parakeet 中文預設。iOS 既有 Apple Speech 路徑保留。所有模型必須用真實中文案例驗證後固定版本；目前沒有完成真實推論驗收。

參賽版截圖匯入也涵蓋「有日期標頭的單日待辦清單」：每列先成為本人可見的審閱卡。沒有明確起訖就停下來詢問；期限或提醒可以略過，略過項目不會進入空檔表。這個使用者確認與確定性填格流程已由本機測試驗證，中文圖片模型辨識仍待真實 Nebius 呼叫驗證。

iOS 支援照片選取、Share Extension、TimeTree 三類判斷、手動／語音草稿修正及確認後加入 Apple Calendar。操作和驗證紀錄見 [截圖匯入流程](voice-calendar-import.md)。

此 repository 最早可見 commit 為 `fb3c8b7`（2026-09-13T16:03:02+08:00），不能據此斷言更早的專案起始時間。參賽分支 `codex/nvidia-hackathon` 的設計、實作範圍、部署設定、待驗收項目與提交材料見 [Hackathon guide](hackathon/README.md)。合成三帳號雲端驗收已通過；真實 Nebius 推論、公開 demo、朋友手機驗收與影片尚待完成。

參賽版的協調功能需使用完整 migration 歷史；不可只套用 `20260913010000_ai_calendar_mvp.sql`。現有專用專案已套用 21 份 migration，並部署 `calculate-results`。`deadline-worker`／每日排程不在目前 hackathon 核心流程驗收內。

`lib/scoring.ts` 是獨立計分核心，測試涵蓋整段最低分、優先出席者排序以及未提交／未知值。

## Google 與 Microsoft 行事曆

外部行事曆使用 OAuth authorization code + PKCE，且只要求唯讀權限。Provider token 會先以 AES-256-GCM 加密，再由 server-only Supabase client 保存；瀏覽器與一般 authenticated role 無權讀取 credential table。

1. 在 Google Cloud 建立 Web OAuth client，開啟 Calendar API，加入 callback：`$APP_ORIGIN/api/calendar-integrations/google/callback`。
2. 在 Microsoft Entra 建立 Web app registration，加入 callback：`$APP_ORIGIN/api/calendar-integrations/microsoft/callback`，並加入 delegated `Calendars.Read`。
3. 在 `.env.local` 設定 `.env.example` 中的 Google、Microsoft 與 `APP_ORIGIN` 變數。
4. 以 `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='` 產生 `CALENDAR_TOKEN_ENCRYPTION_KEY`。正式環境更換這把 key 前，必須先重新加密已保存的 token。

連接後，首頁會同步目前一週的 Google Calendar 或 Microsoft 365 Calendar 事件。`/api/timezones` 由執行環境的 IANA time-zone database 回傳時區和 GMT offset，不需要第三方 GMT API key。TimeTree 的公開 API 已停用；Apple Calendar 的 Web 版保留圖片／語音匯入，iOS 版使用 EventKit。

## Flutter iOS 優先 App

`mobile/` 是獨立 Flutter 工作區：Google／Apple Supabase PKCE 登入、五日滑動週視圖、月／年切換、磨砂玻璃事件卡、離線草稿、邀約建立／分享／填空檔／推薦／拍板與 `/api/v1` bearer API 已準備。iOS Runner 已註冊 `com.yuema.mobile` deep link 和 EventKit 權限；建立真機包前仍需填入 Supabase、API、OAuth 憑證與簽署設定。

## 目錄

- `components/planner/Planner.tsx`：週／月／年日曆、外部同步和個人空檔建議。
- `app/coordinate/page.tsx`：建立飯局、填色、推薦和拍板互動。
- `app/api/calendar-integrations/`：OAuth、連線管理與行事曆同步。
- `lib/scoring.ts`：候選時段計分與排序。
- `supabase/migrations/`：Postgres 資料模型、匯入暫存、個人忙碌與 RLS。
- `supabase/functions/`：截止計算與背景工作 Edge Functions。
