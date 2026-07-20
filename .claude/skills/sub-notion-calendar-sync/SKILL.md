---
name: sub-notion-calendar-sync
description: 把 sub-daily-check 產出的 02-zettelkasten/03-Calendar/<date>/<date>.md（當日待辦人讀版）單向同步進 Notion 的「Daily-Sync」資料庫（一天一列：名稱／日期／標籤）。只有 repo -> Notion 一個方向，`標籤`欄位是使用者在 Notion 上手動改的，腳本絕對不會寫入或覆蓋它。用 03-schedule/00-設定檔/.notion-calendar-sync-state.json 做去重跟 contentHash 比對，內容沒變就整個跳過。
---

執行 Calendar 單向同步進 Notion「Daily-Sync」資料庫。

## 前置設定（只需要做一次，使用者手動操作）

1. 沿用 `sub-notion-sync` 已經建立的 Notion internal integration，不用重建；沒有的話見 `.claude/skills/sub-notion-sync/SKILL.md` 的前置設定。
2. 把「Daily-Sync」資料庫所在的 Notion 頁面 Share 給該 integration（Notion API 只能操作明確分享過權限的頁面/資料庫）。
3. 設定環境變數：
   - `NOTION_API_KEY`：跟 `sub-notion-sync` 用同一把 token。
   - `NOTION_DAILY_SYNC_DATABASE_ID`：「Daily-Sync」資料庫的 id（從 Notion 網址複製）。只有 state file 裡還沒快取 `_dataSourceId` 時才需要，成功跑過一次後就不用再帶。
4. 安裝依賴：`cd .claude/skills/sub-notion-calendar-sync/scripts && npm install`

## 步驟

1. 取得目標日期（呼叫端決定，通常是 `date +%F`）。
2. 確認 `02-zettelkasten/03-Calendar/<date>/<date>.md` 存在；不存在就提醒使用者先跑過 `sub-daily-check` 產生它。
3. 執行：
   ```bash
   node .claude/skills/sub-notion-calendar-sync/scripts/sync_notion_calendar.js "02-zettelkasten/03-Calendar/<date>/<date>.md"
   ```
   需要環境變數 `NOTION_API_KEY`（手動測試時使用者自己 export；GitHub Actions 裡從 Secrets 帶入）。
4. 腳本邏輯（不需要你自己判斷要不要重複建立）：
   - 用「日期」當穩定 ID，跟 `03-schedule/00-設定檔/.notion-calendar-sync-state.json` 比對整份 `<date>.md` 內容算出的 `contentHash`：沒紀錄就新建 Notion page；內容沒變就完全跳過（不打任何 Notion API）；內容變了就更新 `名稱`/`日期` 屬性，並把頁面內文整個刪除重建（`<date>.md` 轉成 Notion to-do/文字 blocks）。
   - **`標籤` 欄位永遠不會被腳本寫入或覆蓋**——create/update 送出的 properties 物件都只帶 `名稱`跟`日期`，Notion API 對沒帶到的屬性不會有任何動作，所以使用者在 Notion 上改的標籤不會被同步跑掉。
   - 只做 create/update，不做刪除/封存：`02-zettelkasten/03-Calendar/` 是逐日累積的紀錄資料夾，不會像 Inbox 卡片一樣被刪除。
5. 把腳本印出的統計（新增/更新/略過幾筆）用一兩句話回報。

## 一次回補全部歷史日期

使用者第一次啟用這個同步、或 state file 遺失重建時，想把 `02-zettelkasten/03-Calendar/` 底下所有已存在的 `<date>/<date>.md` 都補推一次進 Notion，不用一天一天手動跑，直接：

```bash
node .claude/skills/sub-notion-calendar-sync/scripts/sync_notion_calendar.js --all
```

這個模式會掃過每個日期資料夾、逐一同步，已經同步過且內容沒變的日子會自動跳過（不會重複建立），每處理完一天就落地一次 state file，中途某天失敗不會丟掉前面已經成功的進度、也不會擋住後面的日期（失敗的天數最後會列在統計裡的「失敗 N 筆」）。平常 `core-cloud-sync` 排程呼叫的還是單一天那種寫法，`--all` 只用在手動回補。

## 已知限制

- **單向 repo → Notion**：Notion 上除了改 `標籤`，不要手動編輯頁面內文——這個頁面是唯讀鏡像，`<date>.md` 下次有變動時會整頁刪除重建 blocks，手動加的內容會被清掉。
- **沒有雙向同步、沒有衝突偵測**：跟 `sub-notion-sync` 對 Inbox 卡片的 pilot 階段限制同理，但這裡本來就設計成單向，所以不構成風險。
- **不掛進本機 `core-daily-sync`**：目前只接在 `core-cloud-sync`（雲端排程）跟直接手動呼叫 `/sub-notion-calendar-sync` 這兩條路徑，避免本機/雲端同一天重複呼叫 Notion API。

## 注意事項

- 不要手動修改 `03-schedule/00-設定檔/.notion-calendar-sync-state.json`，它是腳本自己維護的狀態檔（含 `_databaseId`/`_dataSourceId` 兩個 meta 欄位），且需要 commit 進 git——GitHub Actions 的 runner 每次都是全新環境，不 commit 回去下次就會失憶、重複建立頁面。
- Notion API 的「multi-source database」nuance：拿到的是 `database_id`，但建立/查詢頁面要用 `data_source_id`（透過 `notion.databases.retrieve({ database_id })` 的 `.data_sources[0].id` 解析），這支腳本已經照這個模型寫，細節見 `.claude/skills/sub-notion-sync/scripts/sync_notion.js` 檔頭註解。
- `scripts/node_modules` 不進 git（見同目錄 `.gitignore`），拉下新環境要自己 `npm install`。
