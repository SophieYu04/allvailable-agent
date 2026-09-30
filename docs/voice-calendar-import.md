# TimeTree 截圖與語音修正

2026-09-27。依本次明確授權啟用 Apple Calendar 截圖匯入，取代先前將 Apple 寫入延後的限制。保留既有 Flutter App、邀約、Planner、Deadline 及 Google 唯讀流程。

## 使用流程

1. 日曆按「新增 → 匯入 TimeTree 截圖」或匯入圖片圖示。
2. 選一張截圖，或在 iOS 分享選單選「約嗎匯入截圖」，儲存後開啟約嗎。App 顯示待匯入提醒。分享圖片最多五張，24 小時清除，辨識成功保存草稿後移除已處理的分享圖片。
3. Vision OCR 只讀使用者選取的圖片，保留文字位置。Nemotron 先分類 TimeTree 月／週／清單／事件詳情結構，再以另一個請求抽取事件。普通聊天、照片等停止流程，不產生事件；possible 保留預覽但禁止 Apple 寫入。高信心門檻為 0.9，不代表經資料集量測的準確率。
4. 每筆事件都是伺服器暫存的 Draft，可修改名稱、開始／結束日期、時間、時區、全天或刪除；可新增漏掉的事件。缺少年份、日期、時間不猜測。資料不完整時停在草稿。
5. 點「語音修正」，選 iOS 中文辨識或 Nebius 音訊端點，錄音後按辨識。先顯示轉錄和修改內容，再套用到草稿。支援改名稱／日期／起訖、刪除、新增與確認；確認語音只開啟審閱，不會直接寫入。常見中文時間／星期修正先用確定性解析，其餘使用 Nemotron 的限定 schema。
6. 點「確認加入 Apple Calendar」。缺時區時明確詢問是否採用台灣時間；其他缺漏須逐筆補齊。顯示完整預覽，繼續後才要求 EventKit 權限，選擇目標日曆的確認按鈕後才儲存。
7. 部分失敗保留草稿及已完成狀態。草稿識別碼與 EventKit URL marker 防止同一裝置重試重複匯入；已寫入批次鎖定編輯。此流程只新增事件，草稿刪除不會刪除真正 Calendar 事件。

## 實作邊界

- 模型輸出不持有 EventKit 或寫入 Calendar 的工具。伺服器 `apple_preview` 再驗證分類、來源、完整欄位和起訖，原生 bridge 僅接收明確確認後的資料。
- 草稿沿用既有 `calendar_imports`、owner 篩選、RLS 與版本鎖；無新增資料表或遠端 migration。跨帳號切換停止操作。重試識別碼包含帳號與匯入／事件 id。
- Apple Calendar 需要完整存取權限以列出可寫入日曆及查重；權限只在確認加入時要求。iOS 17 以下沿用 EventKit events 權限。照片 picker 設定 `requestFullMetadata: false`，不要求整本相簿權限。
- 中文 Speech 權限只在使用者要求辨識錄音時索取。錄音最長 60 秒；失敗可重錄或手動輸入。
- Share Extension 只保存使用者分享的圖片，不使用非公開 API 強行開啟主 App。主 App 回前景／重開會顯示待匯入入口。
- Debug/Profile 共用 `group.com.yuema.mobile.widgets`，Release 沿用 `group.com.yuema.yuemaMobile.widgets`。Runner、CalendarShare 及既有 Widget 的 App Group 必須有相符簽署能力。真機需為新增的 CalendarShare bundle 啟用簽署。
- 沒有將 Apple Calendar 事件自動同步成 App 自有事件；匯入成功後可在 Apple Calendar 查看。

## 本機驗證

- Vitest：草稿不確定分類禁止寫入、來源關聯、缺欄位、不合法日期、跨日、草稿刪除及中文修正；分類為非行事曆時不呼叫事件 extraction。
- Flutter widget：取消預覽不要求 Calendar 權限、不寫入；兩次明確確認後才寫入；拒絕權限保留草稿；手動儲存失敗保留輸入。
- iOS Simulator build：Runner、CalendarShare 與既有 YuemaWidgets 打包。
- 尚無 Nebius key／真實 TimeTree 樣本／真機權限與分享選單的端到端結果，不能宣稱 TimeTree 高辨識率或已完成正式驗收。需以真實月／週／清單／詳情截圖及負例資料集量測；API 端點與中文 Speech 可用性亦需實機確認。

## 日期型待辦審閱卡 — 2026-09-28

- 有明確日期標頭與結構化活動列的單日 planner／待辦截圖也可進入逐筆審閱；每列保留為獨立候選。一般聊天、文章、照片或沒有日期的清單仍拒絕抽取。
- 沒有確切時刻的任務維持待確認。使用者可逐題輸入或用語音補日期、時間、時區；資訊完整後明確確認才成為忙碌時段。截止日／提醒可略過。
- Skip 會從本人這次匯入的事件草稿移除，所以伺服器預覽不會收到該事件，也不會把它算作空檔。
- 本機逐卡 UI 和日期型中文合成截圖已建立；Nebius 推論、中文圖片辨識品質及音訊端點尚未實測。
