---
name: sub-notion-action-sync
description: 把 sub-daily-check 產出的 02-zettelkasten/03-Calendar/<date>/tasks.json 單向同步進 Notion 的「睿恩的行動任務庫（Action）」資料庫，一筆任務一列（行動任務卡片／截止日／專案項目／行動狀態）。只有 repo -> Notion 一個方向，「專案項目」固定掛在 LifeOs 專案卡片下、「行動狀態」只在建立時給預設值，之後腳本絕對不會寫入或覆蓋這兩個欄位。用 03-schedule/00-設定檔/.notion-action-sync-state.json 以每筆任務的 id 做去重跟 contentHash 比對，內容沒變就整個跳過。
---

執行任務單向同步進 Notion「睿恩的行動任務庫（Action）」資料庫。

## 前置設定（只需要做一次，使用者手動操作）

1. 沿用 `sub-notion-sync` 已經建立的 Notion internal integration，不用重建；沒有的話見 `.claude/skills/sub-notion-sync/SKILL.md` 的前置設定。
2. 把「睿恩的行動任務庫（Action）」資料庫所在的 Notion 頁面 Share 給該 integration（Notion API 只能操作明確分享過權限的頁面/資料庫）。
3. 設定環境變數：
   - `NOTION_API_KEY`：跟 `sub-notion-sync` 用同一把 token。
   - `NOTION_ACTION_DATABASE_ID`：「睿恩的行動任務庫（Action）」資料庫的 id（從 Notion 網址複製）。只有 state file 裡還沒快取 `_dataSourceId` 時才需要，成功跑過一次後就不用再帶。
4. 安裝依賴：`cd .claude/skills/sub-notion-action-sync/scripts && npm install`

## 步驟

1. 取得目標日期（呼叫端決定，通常是 `date +%F`）。
2. 確認 `02-zettelkasten/03-Calendar/<date>/tasks.json` 存在；不存在就提醒使用者先跑過 `sub-daily-check` 產生它。
3. 執行：
   ```bash
   node .claude/skills/sub-notion-action-sync/scripts/sync_notion_action.js "02-zettelkasten/03-Calendar/<date>/tasks.json"
   ```
   需要環境變數 `NOTION_API_KEY`（手動測試時使用者自己 export；GitHub Actions 裡從 Secrets 帶入）。
4. 腳本邏輯（不需要你自己判斷要不要重複建立）：
   - `tasks.json` 是滾動視窗（今天的檔案裡也包含未來一週的任務），所以同步的對象是**整份檔案涵蓋的所有任務**，不是只挑 `date` 等於今天的項目。
   - 去重鍵是每筆任務自帶的 `id`（`sha1(source_file+date+title)` 前 12 碼，跟 `sub-apple-sync` 共用同一套規則），跟 `03-schedule/00-設定檔/.notion-action-sync-state.json` 比對以 `title`/`date`/`time`/`notes` 算出的 `contentHash`：沒紀錄就新建 Notion page（`行動任務卡片`＝標題、`截止日`＝日期＋時間、`專案項目`＝固定關聯 LifeOs 專案卡片、`行動狀態`＝預設「尚未開始」）；內容沒變就完全跳過（不打任何 Notion API）；內容變了就只更新 `行動任務卡片`/`截止日`。
   - **`專案項目`／`行動狀態` 這兩個欄位建立後永遠不會被腳本覆蓋**——update 送出的 properties 物件都不帶這兩個欄位，所以使用者在 Notion 上手動改的分類、勾選的進度都不會被同步跑掉。
   - 只做 create/update，不做刪除/封存。
5. 把腳本印出的統計（新增/更新/略過幾筆）用一兩句話回報。

## 一次回補全部歷史日期

使用者第一次啟用這個同步、或 state file 遺失重建時，想把 `02-zettelkasten/03-Calendar/` 底下所有已存在的 `<date>/tasks.json` 都補推一次進 Notion，不用一天一天手動跑，直接：

```bash
node .claude/skills/sub-notion-action-sync/scripts/sync_notion_action.js --all
```

這個模式會掃過每個日期資料夾、合併所有 tasks.json 裡的任務（同一個 id 只處理一次），已經同步過且內容沒變的任務會自動跳過（不會重複建立），每處理完一筆就落地一次 state file，中途某筆失敗不會丟掉前面已經成功的進度、也不會擋住後面的任務（失敗的筆數最後會列在統計裡的「失敗 N 筆」）。平常 `core-cloud-sync` 排程呼叫的還是單一份 tasks.json 那種寫法，`--all` 只用在手動回補。

## 已知限制

- **單向 repo → Notion**：Notion 上除了改 `行動狀態`、`專案項目`、`問題／目標`、`學習點`、`工作時間（分鐘）`等使用者自己維護的欄位，不要手動編輯 `行動任務卡片`/`截止日`——這兩個欄位下次內容有變動時會被腳本覆蓋回 repo 的版本。
- **沒有雙向同步、沒有衝突偵測**：跟 `sub-notion-sync` 對 Inbox 卡片的 pilot 階段限制同理，但這裡本來就設計成單向，所以不構成風險。
- **不掛進本機 `core-daily-sync`**：目前只接在 `core-cloud-sync`（雲端排程）跟直接手動呼叫 `/sub-notion-action-sync` 這兩條路徑，避免本機/雲端同一天重複呼叫 Notion API。
- **標題變動會產生新任務**：任務 `id` 是 `sha1(source_file+date+title)`，修正標題文字（例如改錯字）會讓 id 改變，視為全新任務、舊的 Notion page 會變成孤兒（不會被刪除，只是不再更新）——跟 `sub-apple-sync` 既有的限制一致，非本次同步特有。

## 注意事項

- 不要手動修改 `03-schedule/00-設定檔/.notion-action-sync-state.json`，它是腳本自己維護的狀態檔（含 `_databaseId`/`_dataSourceId` 兩個 meta 欄位），且需要 commit 進 git——GitHub Actions 的 runner 每次都是全新環境，不 commit 回去下次就會失憶、重複建立頁面。
- Notion API 的「multi-source database」nuance：拿到的是 `database_id`，但建立/查詢頁面要用 `data_source_id`（透過 `notion.databases.retrieve({ database_id })` 的 `.data_sources[0].id` 解析），這支腳本已經照這個模型寫，細節見 `.claude/skills/sub-notion-sync/scripts/sync_notion.js` 檔頭註解。
- `scripts/node_modules` 不進 git（見同目錄 `.gitignore`），拉下新環境要自己 `npm install`。
- 這個 skill 是舊版 `sub-notion-calendar-sync`（同步進「Daily-Sync」資料庫、一天一列）的完全取代品，不是並行方案。舊資料庫裡歷史頁面不會被刪除，但不會再被更新。
