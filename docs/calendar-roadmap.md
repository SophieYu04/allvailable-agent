# 約嗎：行事曆與 AI 時間協調

> 歷史規劃，已被後續需求部分取代。開發以 [目前有效需求](product-requirements.md) 與 [決策紀錄](product-decisions.md) 為準。下文的 AI／原生 App 延後、事件名稱不保存、Web 優先順序及估時均不能當成目前承諾；保留原文供追溯，不代表功能已完成或可放行。

## 策略與目前成果
以個人週曆為入口，把不同來源的忙碌時間放在一起，再逐步提供多人協調與原生 App。假設目前為驗證期、單一工程人力；使用者數及商業指標尚未知。此次已完成週／月／年介面、08:00 起每小時格線、裝置本機事件操作、Google Calendar 與 Microsoft 365 Calendar 的 OAuth/唯讀同步程式、版本化 `/api/v1` 事件 API、外部忙碌最小化保存、AI 圖片與語音匯入入口、個人規則式空檔建議，以及 Flutter iOS 優先的五日滑動日曆垂直切片。多人流程保留於 `/coordinate`。外部連線仍需部署資料表並設定 OAuth app credentials；原生日曆需在 Flutter Runner 產生後接上 Pigeon adapter。

## Now（0–6 週）：承諾方向
| 項目 | 成果敘述 | 驗收指標（目標） | 負責 | 依賴 |
|---|---|---|---|---|
| 日曆主介面 | 讓個人使用者在同一畫面查看、修改一週行程，以降低規劃成本 | 新增事件 < 30 秒；週/月/年可往返 | 工程 | 現有 React；本次完成 |
| 匯入與衝突檢查 | 讓使用者合併已知忙碌時段，以減少漏看衝突 | 確認後匯入成功率 > 95% | 工程 | 現有登入、匯入 API、AI 設定；尚需真實帳號驗收 |
| 共用事件服務 | 讓同一帳號跨裝置取得同一份行程，以建立 App 基礎 | 跨裝置事件一致率 100% | 工程 | events 資料模型、使用者隔離、版本衝突處理 |
| 外部唯讀同步啟用 | 讓使用者連接 Google 或 Microsoft 日曆，以減少重複輸入 | 測試帳號一週同步成功率 > 95% | 工程 | 本次程式完成；待 migration、OAuth credentials 與正式 redirect URI |
| Flutter iOS 垂直切片 | 讓 iOS 使用者以五日週曆查看與新增自己的事件 | 真機可登入、離線新增可重連同步 | 工程 | `mobile/` 已完成；待 Flutter SDK、Runner 與真實 Supabase |

## Next（6–12 週）：計劃方向，依實測調整
| 項目 | 成果敘述 | 驗收指標（目標） | 負責 | 依賴 |
|---|---|---|---|---|
| Google / Microsoft 增量與背景同步 | 讓跨平台使用者不必開啟頁面也能取得新行程 | 同步延遲 < 5 分鐘 | 工程 | 已完成唯讀區間同步；尚需 webhook/增量游標與排程 |
| AI 多人時間協調 | 讓主揪用自然語言描述限制並選擇共同空檔，以縮短往返確認 | 首次協調時間降低 50%（先量基準） | 工程 | 已授權 free/busy、既有 scoring、結構化模型輸出、最終重查衝突 |

## Later（12+ 週）：探索
| 項目 | 成果敘述 | 驗收指標（目標） | 負責 | 依賴 |
|---|---|---|---|---|
| iOS / EventKit | 讓手機使用者整合装置日曆並隨時規劃，以提升每週使用頻率 | App 核心流程完成率 > 90% | 工程 | `DeviceCalendarApi` 與 adapter 已準備；待 Flutter Runner、真機授權與同步驗收 |
| 自動協調偏好 | 讓重複約會自動產生符合個人偏好的候選，以減少安排時間 | 接受推薦比例 > 60% | 待定 | 足夠使用回饋、可撤銷偏好、可解釋排序 |

## RICE 優先序
以每季 100 位試用者作為假設 Reach，非真實數據；Effort 為人週。
| 項目 | Reach | Impact | Confidence | Effort | 分數 |
|---|---:|---:|---:|---:|---:|
| 日曆主介面 | 100 | 3 | .9 | 2 | 135 |
| 匯入與衝突 | 70 | 3 | .8 | 2 | 84 |
| 共用事件服務 | 100 | 2 | .8 | 2 | 80 |
| 外部同步 | 70 | 3 | .7 | 4 | 36.75 |
| AI 多人協調 | 50 | 3 | .6 | 3 | 30 |
| 原生 App | 40 | 2 | .5 | 6 | 6.67 |

## SDK / API 與相容性
- Google：官方 Calendar REST API，events.list + nextSyncToken 做增量同步，過期 token 重新完整同步；freeBusy.query 提供空檔資訊。https://developers.google.com/workspace/calendar/api/guides/sync
- Teams：Microsoft Graph 的 Outlook calendarView 讀取日曆事件；getSchedule 查詢工作／學校帳號 free/busy。Teams Shifts schedule 不是個人日曆。https://learn.microsoft.com/en-us/graph/api/calendar-getschedule?view=graph-rest-1.0
- Apple：原生 App 使用 EventKit；Web 不可直接呼叫 EventKit。Web 訂閱／檔案匯入作為獨立後續工作。https://developer.apple.com/documentation/eventkit
- TimeTree：公開 Connect App API 已於 2023-12-22 停用，不安裝已停用的 SDK；目前使用既有 AI 截圖匯入。https://timetreeapp.com/intl/en/newsroom/2023-12-14/connect-app-api-202312
- AI：沿用既有伺服器模型整合；模型解析意圖，確定性演算法檢查衝突，使用者選定後才寫入。不得把未知可用性當作同意。

## App 共用合約準備
`lib/calendar/provider-contract.ts` 定義供應商邊界；Google 與 Microsoft 已有 OAuth + PKCE、AES-256-GCM token 保存、refresh 與區間同步路由。Apple adapter 留給 EventKit App target。
事件時間以 UTC instant + IANA timezone 表示；全天事件以日期和排他結束日表示。供應商 ID 與本地 ID 分離；uid 去重、重複事件例外、刪除標記、etag/version 與分頁不可省略。OAuth token 僅保存在伺服器，App 經同一事件 API。現有 personal_busy_cells 僅包含忙碌格子，不可當作完整事件資料表。
外部同步快照只保留來源識別、時間和 busy／tentative；事件名稱只在一次同步回應內轉成「忙碌／待確認」，不寫入 `external_calendar_events`。

## 依賴
主介面 → 共用事件服務 → 外部授權與增量同步 → 多人 free/busy → AI 約束解析 → 候選重查 → 人工確認 → 寫回。
共用事件服務 → App 登入／離線佇列 → EventKit。

## 不在本階段做
- TimeTree 公開 API 同步：服務已停用。
- 未確認就寄出邀請、替所有人改行程：尚無此授權與衝突保障。
- 全平台 App 同時開發：先驗證 Web 的協調需求與共用資料契約。

## 產能與風險
Now 粗估 6 人週已填滿一人產能；Next 估 7 人週超過 6 週容量，需先交付一個 Google connector，再安排 Microsoft／AI，或增加人力。每兩週檢查實際工時與使用結果，Later 每季檢討。所有指標為驗證目標。
1. OAuth 應用設定、審核與測試帳號尚未提供；程式已完成，但在加入 credentials、redirect URI 與 migration 前不會顯示可連接狀態。
2. 現有匯入須登入、後端 migration 與 AI 設定可用；本次未部署或驗證外部帳號。
3. 新增事件目前明確為裝置本機資料，不會自動寫入忙碌格子或跨裝置同步。
4. 時區／夏令時間、全天、多日及重複事件需在事件服務階段完整覆蓋。
