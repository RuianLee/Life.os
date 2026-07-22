# Notion 同步

Life.os 有兩條互相獨立的 Notion 同步管線，處理的資料完全不同，不要搞混。

## 該用哪一個？

| 情況 | 用哪個 | 說明 |
|---|---|---|
| 只是想確認今天的待辦有沒有進到 Notion 的「Daily-Sync」資料庫 | 不用手動做，`/core-cloud-sync` 每天自動跑 | 見下方「每日待辦鏡像」 |
| 第一次啟用鏡像、或想把過去所有日期一次補進 Notion | `/sub-notion-calendar-sync`（`--all` 模式） | 見下方「一次回補全部歷史」 |
| 想把 `02-zettelkasten/01-Inbox/` 的筆記卡片跟 Notion 互相同步 | `/sub-notion-sync` | 見下方「Inbox 卡片雙向同步」 |

## 每日待辦鏡像進 Notion（`sub-notion-calendar-sync`）

- 把 `02-zettelkasten/03-Calendar/<日期>/<日期>.md`（當日待辦人讀版）單向同步進 Notion 的「Daily-Sync」資料庫。舊格式日期一天一列（名稱／日期／標籤）；新格式日期（有 `tasks/` 卡片資料夾）除了當天彙總那一列，**每筆任務也各自變成同一個資料庫裡的一列**（名稱前綴日期，例如「2026-07-21-書報、聖經（40/20分鐘）」），這樣任務才是正式的資料庫項目，可以在其他資料庫用 Notion 的 Relation 屬性直接關聯到個別任務（不是只能關聯到整天）。當天那一列的內文會有一張表格連到每筆任務列。
- 每一列（不管是當天彙總還是個別任務）都有 `種類`欄位標示自己是「總結」還是「任務」，跟 `完成`欄位（未開始／進行中／已完成）。`完成` 只有第一次新建那一列時會設成「未開始」，之後你在 Notion 上手動改成進行中/已完成，腳本重跑不會把它蓋回去（跟 `標籤` 一樣受保護）。
- **只有 repo → Notion 一個方向**。Notion 上除了「標籤」欄位，不要手動編輯頁面內文——內容有變動時會整頁刪除重建，手動加的東西會被清掉。
- **標籤欄位是你的**：腳本 create/update 時只會帶「名稱」「日期」兩個屬性，永遠不會碰「標籤」，可以放心在 Notion 上自己改。
- 平常不用自己跑：這是 `/core-cloud-sync` 每天台灣時間 06:00 自動流程的最後一步（見 [00-user-guide/訂定每日行程.md](訂定每日行程.md)）。

### 一次回補全部歷史日期

第一次啟用、或狀態檔遺失重建時，想把 `02-zettelkasten/03-Calendar/` 底下所有日期都補推一次：

```bash
node .claude/skills/sub-notion-calendar-sync/scripts/sync_notion_calendar.js --all
```

已經同步過且內容沒變的日子會自動跳過，某天失敗不會擋住其他日期，失敗的天數會列在統計裡。平常排程用的是單一天寫法，`--all` 只在手動回補時用。

## Inbox 卡片雙向同步（`sub-notion-sync`，Pilot 階段）

- 同步範圍目前只有 `02-zettelkasten/01-Inbox/`。
- 四種指令：

  | 指令 | 做什麼 | 需要 API token 嗎 |
  |---|---|---|
  | `status` | 像 `git status`，列出新增／異動／未變動／Notion 已刪除四類 | 不用（純本地比對） |
  | `diff` | 像 `git diff`，列出「異動」卡片實際改了什麼 | 不用 |
  | `push` | repo 卡片 → Notion（新建／更新／封存） | 要 |
  | `pull` | Notion 上新建的頁面 → repo 卡片 | 要 |

  輸入 `/sub-notion-sync` 後告訴我要跑哪個指令即可。

- 只手動觸發，沒有排程，也還沒掛進 `core-daily-sync`。
- **沒有衝突偵測**：同一張卡片兩邊都改過的話，先跑的方向會直接蓋掉另一邊，目前手動低頻使用風險可控。
- **圖片只有 push 方向支援**：`push` 會把卡片裡本地圖片上傳到 Notion 並換成 image block（成功後刪除本地檔案）；`pull` 抓回來的 Notion 頁面目前不含圖片。

## 前置設定（只需要做一次）

兩條管線共用同一個 Notion internal integration：

1. 到 notion.so/my-integrations 建立 integration，取得 API token。
2. 把要用到的 Notion 頁面（「Daily-Sync」資料庫所在頁面、或給 `sub-notion-sync` 用的空白頁面）Share 給這個 integration——Notion API 只能操作明確分享過權限的頁面。
3. 設定環境變數 `NOTION_API_KEY`（兩邊共用同一把 token）。`sub-notion-calendar-sync` 另外需要 `NOTION_DAILY_SYNC_DATABASE_ID`（只有狀態檔還沒快取 `_dataSourceId` 時才用得到）；`sub-notion-sync` 另外需要 `NOTION_PARENT_PAGE_ID`（只有資料庫還沒建立時需要，建立後 id 會存進狀態檔）。
4. 各自安裝依賴：
   ```bash
   cd .claude/skills/sub-notion-calendar-sync/scripts && npm install
   cd .claude/skills/sub-notion-sync/scripts && npm install
   ```

## 相關檔案位置

- skill 定義：`.claude/skills/sub-notion-calendar-sync/`、`.claude/skills/sub-notion-sync/`
- 狀態檔（需要 commit 進 git，否則 GitHub Actions 全新環境會失憶、重複建立）：
  - `03-schedule/00-設定檔/.notion-calendar-sync-state.json`
  - `02-zettelkasten/.notion-sync-state.json`
- GitHub Secrets：`NOTION_API_KEY`、`NOTION_DAILY_SYNC_DATABASE_ID`

## 注意事項

- 兩個狀態檔都是腳本自己維護的，不要手動修改。
- Notion API 是「multi-source database」模型（2025 改版）：拿到的是 `database_id`，但查詢／建立頁面要用底下的 `data_source_id`。網路上找到的舊版 Notion API 範例可能用的是舊寫法，不要照抄。
