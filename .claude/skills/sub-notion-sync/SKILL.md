---
name: sub-notion-sync
description: Pilot——把 02-zettelkasten/01-Inbox/ 的卡片跟 Notion 資料庫做雙向同步。push 把 repo 的 .md 卡片建立/更新到 Notion；pull 把你直接在 Notion 上新建的頁面抓回來變成 .md 卡片；status/diff 純本地比對哪些卡片還沒上傳/內容變了要重傳、變了什麼，不用打 API、不用 token。跟任務流（daily-plan）不同，筆記流沒有「誰控制狀態」的問題，純粹是內容搬運＋轉檔（Notion blocks ↔ Markdown）。目前只手動觸發，還沒排程、也還沒掛進 core-daily-sync。
---

執行 Zettelkasten 筆記跟 Notion 的雙向同步（pilot 階段，範圍只有 `02-zettelkasten/01-Inbox/`）。

## 前置設定（只需要做一次，使用者手動操作）

1. 到 notion.so/my-integrations 建立一個 internal integration，取得 API token
2. 在 Notion 建立一個空白 page（例如「Life OS」），用 Share 把該 integration 加進去——Notion API 只能操作明確分享過權限的頁面
3. 設定環境變數：
   - `NOTION_API_KEY`：上面拿到的 token
   - `NOTION_PARENT_PAGE_ID`：那個空白 page 的 id（只有資料庫還沒建立時需要，第一次跑 `push` 會自動在它底下建資料庫，之後 id 會存進 state file，不用再帶這個變數）
4. 安裝依賴：`cd .claude/skills/sub-notion-sync/scripts && npm install`

## 步驟

1. 確認 `.claude/skills/sub-notion-sync/scripts/node_modules` 已安裝（沒有就先 `npm install`）
2. 依使用者要的方向執行：
   ```bash
   node .claude/skills/sub-notion-sync/scripts/sync_notion.js status # 純本地比對，不用 token，先看有哪些要同步
   node .claude/skills/sub-notion-sync/scripts/sync_notion.js diff   # 純本地比對，看異動的卡片實際改了什麼（像 git diff）
   node .claude/skills/sub-notion-sync/scripts/sync_notion.js push   # repo 卡片 -> Notion
   node .claude/skills/sub-notion-sync/scripts/sync_notion.js push --force  # 忽略 contentHash，強制全部重推（改了同步邏輯本身、想讓既有卡片套用新規則時用）
   node .claude/skills/sub-notion-sync/scripts/sync_notion.js pull   # Notion 新頁面 -> repo 卡片
   ```
3. 腳本邏輯（不需要你自己判斷要不要重複建立）：
   - **status**：像 `git status` 一樣，掃描 `01-Inbox/` 全部卡片跟 state file 的 `contentHash` 比對，分四類印出來：新增（還沒上傳）、異動（Notion 上是舊版本）、未變動（已同步）、Notion 上有但 repo 已刪除（push 時會封存）。純本地運算，不用打 Notion API，跑之前不用設定任何環境變數。
   - **diff**：像 `git diff` 一樣，對 status 判定為「異動」的卡片，逐行印出跟上次同步版本的差異。比對基準是 state file 裡每張卡片存的 `content` 內容快照，不是 git 的 commit 歷史——所以就算這個檔案從沒 commit 過，只要上次 push/pull 過一次，都能算出真正差異。這個 `content` 快照欄位是後來加的，pilot 早期跑過的 push 沒有存快照，這類卡片下次改動時 `diff` 只會提示「沒有比對基準」，要再跑一次 push/pull 之後才會開始有真正的逐行 diff。
   - **push**：掃描 `02-zettelkasten/01-Inbox/` 底下所有 `.md`，用「相對 `02-zettelkasten/` 的路徑」當穩定 ID。跟 `02-zettelkasten/.notion-sync-state.json` 比對 `contentHash`：沒紀錄就新建 Notion page（frontmatter 的 title/type/tags 對應資料庫屬性，內文轉成 Notion blocks），內容變了就更新，沒變就跳過。repo 端把卡片刪掉的話，會把當初由 push 建立的那個 Notion page 封存（archived）——但如果那個 page 是 `pull` 建的，不會動它。第一次執行還會依 ACCESS 架構在 `NOTION_PARENT_PAGE_ID` 底下建 7 個結構頁面（Inbox/Atlas/Calendar/Card/Extra/Source/Space），只有 Inbox 底下會再建資料庫；`03-Calendar` 刻意不建資料庫，因為那批內容屬於 daily-plan 任務流，由別的同步管線處理。
   - **Date 屬性 = 最後同步時間**：Notion 資料庫的 `Date` 欄位存的是「這筆最後 push/pull 的時間」（每次真的有變動同步時的當下時間），不是卡片 frontmatter 的 `date`（那是卡片自己記錄的建立日期，只留在 `.md` 裡，不會同步進 Notion 的 Date 屬性）。
   - **push 的圖片處理**：卡片內文裡獨占一行的本地圖片參照（`![alt](本地相對路徑.png)`，不管是不是縮排在 list item 底下）會先用 Notion File Upload API 上傳，換成正確的 image block，**push 成功後就把本地圖片檔案刪掉**，並把這個 Notion 頁面網址寫回卡片 frontmatter 的 `notion_url` 欄位（沒有就新增，有就更新，不會重複加）。已經上傳過、本地檔案已刪除的圖片，下次卡片文字再變動需要重新 push 時，會沿用 state 裡記住的 `file_upload_id` 重建 image block，不會因為本地檔案不在了就出錯或漏圖。已經是 `http(s)://` 開頭的外部圖片連結不受影響。
   - **pull**：查詢 Notion 資料庫裡所有「state file 裡沒有對應紀錄」的 page（代表是你直接在 Notion 上新建、不是 push 產生的），把內容轉回 Markdown，在 `01-Inbox/` 新建對應的 `.md` 卡片（frontmatter 從 Notion 屬性重建），並把該 page 的 `RepoPath` 屬性補上，避免下次重複抓。
   - push/pull 都會更新 `02-zettelkasten/.notion-sync-state.json`；status 只讀不寫。
4. 把腳本印出的統計（新增/更新/略過/封存幾筆，或 status 的四類清單）用一兩句話回報，不用重新複述每一筆卡片內容。

## 已知限制（pilot 階段刻意先不解決）

- **沒有衝突偵測**：如果同一張卡片兩邊都在上次同步後改過，才跑的那個方向會直接蓋掉另一邊的改動。目前使用情境是手動觸發、頻率低，風險可控，之後真的要排程自動跑之前要先處理這個。
- **圖片支援只有 push 方向**：`pull` 把 Notion 頁面轉回 Markdown 時，圖片還是不會存回本地，只有文字內容。
- **範圍只有 01-Inbox**：其他分類資料夾（`02-Atlas`、`04-Card` 等）之後視 pilot 結果再擴大，擴大時要重新想一次「新資料夾用資料庫還是子頁面表示」。

## 注意事項

- `02-zettelkasten/.notion-sync-state.json` 是腳本自己維護的狀態檔（含 `_databaseId`/`_dataSourceId` 兩個 meta 欄位，每張卡片底下還有 `content` 內容快照跟 `images` 圖片參照對應表），不要手動修改；如果之後要雲端化（比照 `sub-caldav-sync`），需要 commit 進 git，理由一樣：全新環境不 commit 回去下次就會失憶、重複建立、也會找不到已刪除本地圖片對應的 `file_upload_id`。
- Notion API 在 2025 年做了「multi-source database」改版，資料庫底下多了一層 data source：建資料庫的 schema 要放在 `initial_data_source.properties`、查頁面要用 `dataSources.query`（不是 `databases.query`）、新增頁面的 parent 要指到 `data_source_id`（不是 `database_id`）。這支腳本已經照新模型寫，如果之後看到网路上的 Notion API 範例碼用的是舊寫法，不要照抄回來。
- `scripts/node_modules` 不進 git（見同目錄 `.gitignore`），拉下新環境要自己 `npm install`。
