---
name: core-guest-schedule-sync
description: 讀取吳莉雯姊妹上傳到 03-schedule/02-吳莉雯/ 的整週行程表（截圖或 PDF，固定格式：每天每半小時一格，欄位是「時間／計劃／結果」），逐日拆解時間區塊、合併相鄰且同名稱的區塊成一筆事件、忽略「結果」欄，寫入 events-latest.json，再透過 sub-caldav-sync 的腳本直接同步進她自己的 iCloud 行事曆。跟 brianlee 自己的 03-schedule 分類資料夾／00-計劃總覽.md／Notion 同步／trash-can 完全隔離，不會互相污染。由 .github/workflows/guest-schedule-sync.yml 在她上傳新檔案時自動觸發，也可以手動輸入 /core-guest-schedule-sync 測試（支援 dry-run，見第 4 節）。
---

這是專為吳莉雯姊妹寫死的單一用途 pipeline，範圍只在 `03-schedule/02-吳莉雯/` 這一個資料夾內，**絕對不要**讀寫 `02-zettelkasten/`、`03-schedule/00-計劃總覽.md`、`schedule-log.md`、Notion 相關腳本、`05-trash-can/`——那些是 brianlee 自己的 pipeline，不能被這個 skill 碰到。

## 1. 找出還沒處理的新檔案

沿用 `sub-daily-check` 讀 `schedule/` 的慣例：

- `03-schedule/02-吳莉雯/` 最上層（不含 `原始檔/`）如果有圖片／PDF，代表是她剛上傳、還沒處理的新檔案。
- `原始檔/` 底下的檔案不用讀，是已經處理過的存檔備查。
- 正常情況下最上層一次只會有一個新檔案（一週一份），如果同時有多個新檔案，依檔名/mtime 依序處理，每個都跑完下面 2～3 節的完整流程。

如果最上層沒有任何新檔案（例如這次 workflow 是別的原因觸發，或重跑時已經處理過），直接跳到第 5 節回報「沒有新檔案要處理」，不用往下執行。

## 2. 萃取成人讀版本（.md）

用 Read 工具完整讀取新圖片/PDF，轉譯成同名、副檔名改 `.md` 的 Markdown 檔案，放在同一層（`原始檔/` 外面）。這份表格固定是「每天一欄，每半小時一列，欄位為時間／計劃／結果」，轉譯時：

- 逐日、逐列忠實記錄「時間」和「計劃」兩欄的內容，格式例如：
  ```markdown
  ## 2026-06-29（週一）

  | 時間 | 計劃 |
  |---|---|
  | 05:30 | 起床 |
  | 06:00 | 晨興/讀經 |
  | 09:30 | 大專交通 |
  | 10:00 | 大專交通 |
  ...
  ```
- **不要記錄「結果」欄**（那是她自己回顧用的完成勾選 v，不是行程內容，跟同步無關）。
- 保留完整一週、每一天、每一格，不要自己先篩選「重要」或跳過看起來像生活作息的項目（起床/早餐/休息/睡覺都要記）——整天完整時間區塊都要同步，這是已經跟使用者確認過的設計。
- 這份 `.md` 只是這次執行內部參考用的萃取記錄，不影響 brianlee 自己的任何檔案。

## 3. 合併相鄰區塊、產生 events-latest.json

以第 2 節的 `.md` 為輸入（不用重新看圖），逐日把**相鄰、且「計劃」欄文字完全相同**的格子合併成一筆事件，區間取「第一格的開始時間」到「最後一格的結束時間」（每格半小時，所以最後一格的結束時間 = 該格時間 + 30 分鐘）。例如 09:30、10:00、10:30、11:00、11:30 五格都是「大專交通」→ 合併成一筆 09:30–12:00 的「大專交通」事件。不同名稱的格子不要合併，即使時間相鄰。

每筆事件的欄位（跟 `tasks.json` 格式對齊，方便直接餵給 `sync_caldav.js`）：

```json
{
  "id": "<sha1(\"吳莉雯|\" + date + \"|\" + time + \"|\" + title) 取前 12 碼 hex>",
  "title": "計劃欄的文字，例如「大專交通」",
  "date": "YYYY-MM-DD",
  "time": "HH:MM（合併後第一格的開始時間）",
  "endTime": "HH:MM（合併後最後一格的結束時間）",
  "type": "event",
  "source_file": "03-schedule/02-吳莉雯/<原始檔名>",
  "notes": ""
}
```

`id` 計算方式：`echo -n "吳莉雯|<date>|<time>|<title>" | shasum | cut -c1-12`（帶代稱是為了跟未來如果服務其他人時的 id 空間分開，即使目前只有這一個人）。

**累加、不要覆蓋**：`03-schedule/02-吳莉雯/events-latest.json` 如果已經存在，先讀進來，用 `id` 當 key 跟這次新算出來的事件合併（同 id 覆蓋更新、不同 id 保留），再整份寫回去。**不要**只留這次新上傳這一週的事件、把之前週次的事件丟掉——`sync_caldav.js` 會把「這次沒出現在 events-latest.json 裡」的事件從她的行事曆刪掉，如果每次都只放最新一週，之前週次的事件會被誤刪。

## 4. 同步進她的 iCloud 行事曆（可跳過：dry-run）

檢查環境變數 `GUEST_DRY_RUN`：

- **若 `GUEST_DRY_RUN=true`**：跳過這一步，不要執行下面的指令。直接把這次算出的 `events-latest.json` 內容（或這次新增/更新的部分）整理成表格，在第 5 節回報時完整列出來，讓使用者人工核對抓取是否正確，之後才決定要不要正式跑。
- **否則**：執行
  ```bash
  node .claude/skills/sub-caldav-sync/scripts/sync_caldav.js "03-schedule/02-吳莉雯/events-latest.json"
  ```
  這支腳本會自己處理新增/更新/略過（沒變動）/清除（已消失的事件），並把去重狀態寫回 state 檔。`APPLE_ID_EMAIL`／`APPLE_APP_SPECIFIC_PASSWORD`／`CALDAV_STATE_PATH`／`CALDAV_CALENDAR_NAME` 這幾個環境變數都由外層 workflow 的這個執行步驟直接帶入（對應 GitHub Secrets `GUEST1_APPLE_ID_EMAIL`／`GUEST1_APPLE_APP_SPECIFIC_PASSWORD`，`CALDAV_STATE_PATH` 固定指到 `03-schedule/00-設定檔/.guest-liwen-caldav-sync-state.json`，`CALDAV_CALENDAR_NAME` 固定是 `daily`），這個 skill 不用自己組這行指令的環境變數，也不要自己額外 export——直接照上面那行指令原樣執行即可，跟 `.claude/settings.json` 裡既有的 Bash 允許清單完全對齊，不會跳出權限確認。
  - 如果腳本因為「找不到叫 daily 的行事曆」而失敗：這代表她還沒在自己的 iCloud 帳號手動建立一個叫「daily」的行事曆，把這個訊息原封不動回報給使用者，不要自己嘗試繞過或用別的名稱重試。

## 5. 歸檔原始檔

把第 1 節找到的原始圖片/PDF搬進同一層的 `原始檔/`（不存在就建立）。如果 `原始檔/` 底下已經有同名檔案，搬移前幫舊檔加上日期後綴（例如 `原檔名_2026-07-05.jpg`）避免覆蓋。

**不要自己執行 `git add`/`git commit`/`git push`**——commit 交給 `.github/workflows/guest-schedule-sync.yml` 最後一個獨立步驟處理，這個 skill 只負責把檔案準備好（跟 `core-cloud-sync` 的慣例一致）。

## 6. 回報

用 2-3 句話總結：處理了哪個檔案、抓到幾天、產生/更新了幾筆事件（列出範例，例如「6/29 09:30–12:00 大專交通」這種合併後的區間，方便使用者快速核對合併邏輯有沒有跑對）、是 dry-run 還是已經正式寫進 CalDAV。若是 dry-run，明確提醒使用者「這次沒有寫進她的行事曆，確認沒問題後請用 workflow_dispatch 關掉 dry_run 再跑一次」。不要整段貼 `events-latest.json` 原始內容（除非 dry-run 且內容不多，可以摘要列出這次新增/更新的筆數與代表性範例）。
