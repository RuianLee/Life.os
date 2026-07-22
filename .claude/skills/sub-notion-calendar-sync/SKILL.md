---
name: sub-notion-calendar-sync
description: 把 sub-daily-check 產出的 02-zettelkasten/03-Calendar/<date>/<date>.md（當日待辦人讀版）單向同步進 Notion 的「Daily-Sync」資料庫：舊格式日期一天一列（名稱／日期／標籤／種類／完成），新格式日期（有 tasks/ 資料夾，一任務一卡片＋大表索引）除了當天彙總那一列（種類=總結），每筆任務也各自同步成同一個資料庫裡的一列（種類=任務，名稱前綴日期，例如「2026-07-21-書報、聖經」），方便用 Notion Relation 屬性關聯到個別任務；新建的列預設 完成=未開始，之後使用者手動改的完成進度／標籤永遠不會被腳本覆蓋。只有 repo -> Notion 一個方向。用 03-schedule/00-設定檔/.notion-calendar-sync-state.json 做去重跟 contentHash 比對，內容沒變就整個跳過。
---

執行 Calendar 單向同步進 Notion「Daily-Sync」資料庫。

## 前置設定（只需要做一次，使用者手動操作）

1. 沿用 `sub-notion-sync` 已經建立的 Notion internal integration，不用重建；沒有的話見 `.claude/skills/sub-notion-sync/SKILL.md` 的前置設定。
2. 把「Daily-Sync」資料庫所在的 Notion 頁面 Share 給該 integration（Notion API 只能操作明確分享過權限的頁面/資料庫）。
3. 「Daily-Sync」資料庫要先手動加兩個 select 屬性（腳本只會寫值，不會自動建立屬性）：
   - `種類`：選項至少要有 `總結`、`任務`。
   - `完成`：選項至少要有 `未開始`、`進行中`、`已完成`（進行中/已完成給使用者手動用，腳本只會寫 `未開始`）。
4. 設定環境變數：
   - `NOTION_API_KEY`：跟 `sub-notion-sync` 用同一把 token。
   - `NOTION_DAILY_SYNC_DATABASE_ID`：「Daily-Sync」資料庫的 id（從 Notion 網址複製）。只有 state file 裡還沒快取 `_dataSourceId` 時才需要，成功跑過一次後就不用再帶。
5. 安裝依賴：`cd .claude/skills/sub-notion-calendar-sync/scripts && npm install`

## 步驟

1. 取得目標日期（呼叫端決定，通常是 `date +%F`）。
2. 確認 `02-zettelkasten/03-Calendar/<date>/<date>.md` 存在；不存在就提醒使用者先跑過 `sub-daily-check` 產生它。
3. 執行：
   ```bash
   node .claude/skills/sub-notion-calendar-sync/scripts/sync_notion_calendar.js "02-zettelkasten/03-Calendar/<date>/<date>.md"
   ```
   需要環境變數 `NOTION_API_KEY`（手動測試時使用者自己 export；GitHub Actions 裡從 Secrets 帶入）。
4. 腳本邏輯（不需要你自己判斷要不要重複建立），依 `<date>/` 底下有沒有 `tasks/` 資料夾分兩種：

   **舊格式（沒有 `tasks/`，改版前產生的日期）**：
   - 用「日期」當穩定 ID，跟 `03-schedule/00-設定檔/.notion-calendar-sync-state.json` 比對整份 `<date>.md` 內容算出的 `contentHash`：沒紀錄就新建 Notion page；內容沒變就完全跳過（不打任何 Notion API）；內容變了就更新 `名稱`/`日期` 屬性，並把頁面內文整個刪除重建（`<date>.md` 整份轉成 Notion blocks）。

   **新格式（有 `tasks/`，一任務一卡片＋大表索引）**：
   - **每張本機任務卡片會各自同步成「Daily-Sync」資料庫裡的另一列**（`parent: data_source_id`，跟「當天」那一列是同一個資料庫，不是子頁面），不是把整份 `<date>.md`（含本機相對連結）直接轉 blocks——本機的 `tasks/xxx.md` 連結在 Notion 裡點了不會生效，所以「大表」的「卡片」欄位改成 mention 這些真正的資料庫列。這一列的內容是卡片的 checkbox + 補充說明，`名稱`欄位是 `<任務日期>-<任務標題>`（例如「2026-07-21-書報、聖經（40/20分鐘）」），`日期`欄位是任務日期。名稱帶日期前綴、又是正式資料庫項目，是刻意設計成這樣，方便使用者在其他資料庫用 Relation 屬性直接關聯到個別任務——子頁面不是資料庫項目，Notion 的 Relation 屬性選不到，這是這個設計從「子頁面」改成「資料庫列」的原因。
   - 當天 page 的內文重建成：開頭說明文字（沿用 `<date>.md` 表格前的段落）＋一個 Notion 原生 table block（時間／任務／分類／卡片），「卡片」欄位是可以直接點進去的任務列連結。
   - `contentHash` 比對範圍是「`<date>.md` 全文＋所有任務卡片原始內容」的組合雜湊，只要其中任何一張卡片或大表本身有變動就會重新處理；單張卡片內容沒變就不會重寫那一列（存在 state 的 `tasks` 底下，key 是任務 `id`，紀錄裡有 `date` 欄位代表已經是資料庫列版本；沒有 `date`、只有舊版 `dayPageId` 的紀錄會被視為「還沒同步過」，自動建一列新的，不會誤用舊格式子頁面的 id）。
   - `sub-daily-check` 產生的大表欄位順序（時間／任務／分類／卡片）跟「卡片」欄位必須是 `[連結](tasks/<id>_xxx.md)` 這種格式不能變——這支腳本靠正規表示式解析大表跟卡片檔名裡的 `id` 來對應任務列，格式跑掉會讓「卡片」欄位退回純文字、連不到任務列。
   - **`標籤` 欄位永遠不會被腳本寫入或覆蓋**——不管是當天列還是任務列，create/update 送出的 properties 物件都只帶 `名稱`/`日期`/`種類`（＋新建時的 `完成`），Notion API 對沒帶到的屬性不會有任何動作，所以使用者在 Notion 上改的標籤不會被同步跑掉。
   - **`種類`（select：`總結`／`任務`）**：當天彙總列固定 `總結`、任務列固定 `任務`。這個欄位是結構性資訊、不是使用者會手動改的資料，所以 create／update 都會帶，不用擔心覆蓋。
   - **`完成`（select：`未開始`／`進行中`／`已完成`）：只有新建那一列時才會帶、預設 `未開始`，update 時絕對不會帶這個欄位**——使用者會在 Notion 上手動把這個欄位改成進行中/已完成，如果 update 也帶這個欄位、每次都塞回 `未開始`，會把使用者的進度打回原形。這兩個 select 屬性（`種類`/`完成`）都是使用者事先在 Notion 資料庫手動建立好的，腳本不會自動建立屬性本身，只會寫值進去；如果這兩個屬性被刪掉或改名，腳本寫入會直接報錯，需要使用者在 Notion 上補回來。
   - 只做 create/update，不做刪除/封存：`02-zettelkasten/03-Calendar/` 是逐日累積的紀錄資料夾，不會像 Inbox 卡片一樣被刪除；任務列目前也只有 create/update，本機卡片被刪掉不會連動刪除 Notion 那一列（已知限制，見下方）。
   - **任務列跟「當天」列混在同一個資料庫、同一個日曆檢視裡**：這是使用者明確要的設計（方便用 Relation 屬性關聯個別任務），代價是 Notion 的月曆檢視裡同一天會同時看到「當天彙總」跟該天每一筆任務，畫面會比較多筆；如果覺得太雜，可以在 Notion 那邊另外拉一個篩選過的檢視（例如用「名稱不含 `-`」或另建一個屬性區分兩種列）。
5. 把腳本印出的統計（新增/更新/略過幾筆）用一兩句話回報。

## 一次回補全部歷史日期

使用者第一次啟用這個同步、或 state file 遺失重建時，想把 `02-zettelkasten/03-Calendar/` 底下所有已存在的 `<date>/<date>.md` 都補推一次進 Notion，不用一天一天手動跑，直接：

```bash
node .claude/skills/sub-notion-calendar-sync/scripts/sync_notion_calendar.js --all
```

這個模式會掃過每個日期資料夾、逐一同步，已經同步過且內容沒變的日子會自動跳過（不會重複建立），每處理完一天就落地一次 state file，中途某天失敗不會丟掉前面已經成功的進度、也不會擋住後面的日期（失敗的天數最後會列在統計裡的「失敗 N 筆」）。平常 `core-cloud-sync` 排程呼叫的還是單一天那種寫法，`--all` 只用在手動回補。

## 已知限制

- **單向 repo → Notion**：Notion 上除了改 `標籤`，不要手動編輯頁面內文——這個頁面是唯讀鏡像，`<date>.md` 下次有變動時會整頁刪除重建 blocks，手動加的內容會被清掉（新格式的任務子頁面也一樣，內容由對應的本機卡片決定）。
- **沒有雙向同步、沒有衝突偵測**：跟 `sub-notion-sync` 對 Inbox 卡片的 pilot 階段限制同理，但這裡本來就設計成單向，所以不構成風險。
- **不掛進本機 `core-daily-sync`**：目前只接在 `core-cloud-sync`（雲端排程）跟直接手動呼叫 `/sub-notion-calendar-sync` 這兩條路徑，避免本機/雲端同一天重複呼叫 Notion API。
- **任務列不會被刪除**：如果 `sub-daily-check` 重新執行時把某張任務卡片從本機 `tasks/` 資料夾清掉（例如任務不再需要），對應的 Notion 資料庫列不會被自動封存/刪除，會變成孤兒列留在資料庫裡、但不會出現在重建後的大表裡。目前手動清理，之後如果覺得困擾可以考慮補上封存邏輯。
- **改版史（2026-07-21）：任務曾經一度做成「子頁面掛在當天 page 底下」，已改回「跟當天列同一個資料庫的另一列」**：子頁面版本有兩個問題才改掉——(1) 子頁面不是資料庫項目，Notion 的 Relation 屬性選不到，沒辦法從別的資料庫關聯到個別任務；(2) 重建當天 page 內容時，如果不小心把代表子頁面的 `child_page` block 也刪掉，等同把那個子頁面整個丟進 Notion 垃圾桶（真實發生過一次，18 個子頁面被誤刪，已用 API 手動復原）。改成資料庫列之後這兩個問題都不存在了。**2026-07-20／2026-07-21 這兩天改版當下就地保留了 9 個舊版子頁面在當天 page 底下**（使用者決定先不清、新舊並存），跟現在大表 mention 的資料庫列是兩批不同的 Notion 物件、內容可能不同步，之後如果要清理由使用者自行判斷。`replacePageContent` 仍然保留「跳過 `child_page`/`child_database` 不刪」的防呆邏輯，即使現在的設計不會主動建立子頁面，這個防呆留著也無害。

## 注意事項

- 不要手動修改 `03-schedule/00-設定檔/.notion-calendar-sync-state.json`，它是腳本自己維護的狀態檔（含 `_databaseId`/`_dataSourceId` 兩個 meta 欄位），且需要 commit 進 git——GitHub Actions 的 runner 每次都是全新環境，不 commit 回去下次就會失憶、重複建立頁面。
- Notion API 的「multi-source database」nuance：拿到的是 `database_id`，但建立/查詢頁面要用 `data_source_id`（透過 `notion.databases.retrieve({ database_id })` 的 `.data_sources[0].id` 解析），這支腳本已經照這個模型寫，細節見 `.claude/skills/sub-notion-sync/scripts/sync_notion.js` 檔頭註解。
- `scripts/node_modules` 不進 git（見同目錄 `.gitignore`），拉下新環境要自己 `npm install`。
