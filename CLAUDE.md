# Life.os

這是 brianlee 的個人 Life OS 專案，用來管理生活/信仰/職涯/側專案/每日行程的筆記與自動化工具。內容以中文為主：第一層資料夾用 `NN-name` 編號前綴排序（例如 `01-main-project/`、`02-zettelkasten/`），第二層開始維持中文，其中技術類子資料夾（如 `church-life/`、`software-project/`）仍維持英文 kebab-case。

給「人」看的總覽（依場景列出這個專案可以幹嘛）見根目錄 `README.md`；這份文件是給 Claude 的資料夾結構與慣例說明。

## 資料夾結構

- **00-user-guide/**（原 使用手冊/user-guide）— 特定功能的操作手冊（給人看的「怎麼用」），例如 `訂定每日行程.md`
- **01-main-project/**（原頂層各自獨立的 church-life/、project/，收攏成一個側專案工作區）
  - `church-life/`（原 召會生活）— 召會生活相關文件
    - `聖經陪讀/` — 讀經與陪讀教材
      - `第一次陪讀聖經就上手/` — 既有的讀經小組培訓資料（doc/pdf/pptx）
      - `製作自己的聖經陪讀教材/` — 正在製作中的個人陪讀教材，用 LaTeX（`.tex`）排版，例如 `約翰福音.tex`
    - `家聚會/` — 家聚會相關資料
    - `小排信息/`（原 書報追求，原本是空資料夾，改用途成小排聚會信息記錄）— 例如 `2026-07-16.md`
    - `海外開展/` — 海外開展見證/分享的逐字稿，例如 `26青短海外開展見證.md`（青職短訓期間的見證逐字稿，語音辨識初稿，尚未修正）
    - `美地展/` — 特定信息（教師交通等）的逐字稿與手寫綱要整理，例如 `260708.md` 是青職短訓期間某堂「美地展啟」教師交通的逐字稿＋綱要；語音辨識錯誤用 `core-transcript-fix` skill 修正
  - `software-project/`（原 project/，`personal-site/` 已移除）
    - `技術棧.md` — 跨專案的技術堆疊總覽（Claude Code skill 自動化 / VSCode Extension / LaTeX 各用什麼技術），日後寫新小工具時的選型參考
    - `DocOutline/` — 自製 VSCode 擴充套件：把 Skim 標註的 PDF 螢光筆重點轉成 LaTeX 內容，用於製作陪讀教材。詳見 `DocOutline/ReadMe.md`。這是實際在跑的程式碼專案（package.json/tsconfig 等都寫死路徑），刻意保留英文資料夾名稱
    - `同步排程到蘋果軟件/` — 每日行程同步那組 skill 的技術實作文件（架構、踩過的坑）
    - `行事曆排程/` — 研究筆記階段，研究如何用比對邏輯（新資料 vs 既有行事曆事件、或 vs 標準行程樣板）減少 core-daily-sync 每次都要重新讓 LLM 判斷的 token 消耗，並搭配 VSCode 面板統一檢視/確認後再派發，見 `行事曆排程/研究筆記.md`；第一步「檔案級萃取快取」（見 03-schedule/ 條目）已實作，其餘（比對既有事件/樣板、VSCode 審核面板）仍在研究階段
- **02-zettelkasten/**（原 second-brain/，改用卡片盒筆記法的 ACCESS 結構，目標是 Repo 跟 Notion 雙向同步）
  - `00-ReadMe.md`（原 second-brain/主題統整.md）— 興趣、語言、職涯方向、軟體相關、召會成全總覽，含短期年度目標與「目前每日計劃」固定表格
  - `00-Scirpt/` — `new-card.js`：互動式 CLI，在 `01-Inbox/` 底下建立一張新卡片 md（依序問標題／筆記類型／tag），呼應 ACCESS「新筆記先進 Inbox」的概念
  - `01-Inbox/` — 收件匣，新筆記先丟這裡，等有空再一次性批次分類到 Atlas/Calendar/Card/Extra/Source/Space
  - `02-Atlas/` — MOC（地圖型筆記，分類匯總用），目前為空，尚未從舊 second-brain/ 分類容器搬入內容
  - `03-Calendar/<YYYY-MM-DD>/`（原 daily-plan/）— `sub-daily-check` 的產出：`tasks.json`（結構化，供 sub-apple-sync/sub-caldav-sync/sub-notion-calendar-sync 消費，含今天／明天／未來 7 天）＋人讀的 `<日期>.md`（當天待辦「大表」，一張表格連結到 `tasks/` 底下每筆今天任務各自的卡片檔案）＋ `tasks/`（當天每筆任務各一張 `.md` 卡片，含 frontmatter）。這個「一任務一卡片＋大表索引」格式預設只套用到改版後新產生的日期，改版前既有的舊資料夾預設維持原本純 checkbox 條列格式，不主動回溯轉換；使用者可以指名要求把特定舊資料夾也轉成新格式（例如 `2026-07-20/` 已依使用者要求轉換）。已實測跟 `sub-notion-calendar-sync` 相容
  - `04-Card/` — 卡片（自己消化過的永久筆記），目前為空
  - `05-Extra/` — 範本等額外資料，目前為空
  - `06-Source/` — 文獻筆記來源，目前為空
  - `07-Space/` — 專案/長文寫作用的筆記空間，目前為空
- **03-schedule/**（原 schedule/，原 管理行程）— 每日行程的原始資料（截圖、課表、公告等），是 `sub-daily-check` skill 的輸入來源
  - `00-計劃總覽.md`（原 計劃總覽.md）— `sub-daily-check` 的輸出之一，常駐更新（不是每天新建），分「年計劃／月計劃（至少未來3個月）／週計劃（今天～未來7天）」三段，給更長時間尺度的規劃視角；當天待辦仍在 `02-zettelkasten/03-Calendar/<today>/<today>.md`（只放當天）
  - `00-設定檔/` — `.apple-sync-state.json` / `.apple-sync-notes-state.json` 是本機 osascript 同步（sub-apple-sync）的狀態；`.caldav-sync-state.json` 是雲端 CalDAV 同步（sub-caldav-sync）的狀態；`.notion-action-sync-state.json` 是雲端 Notion 鏡像同步（sub-notion-action-sync）的狀態，這幾個都需要 commit 進 git（GitHub Actions runner 每次都是全新環境，不 commit 回去下次就會失憶、重複建立事件/頁面）
  - `schedule-log.md` — 記錄每次整理/搬移的判斷
  - `01-2026召會生活/`（原 2026召會生活/）— 2026 年召會生活相關的排程資料（例如文山一大區夏季訓練時間表）
  - 每個分類子資料夾底下可能有 `原始檔/` 子資料夾，存放已經萃取成同層 `.md` 的原始截圖/PDF，見 `.claude/skills/sub-daily-check/SKILL.md` 的「0a. 讀取 schedule/」
- **04-tools/**（原 productivity/ 與 shortcut/ 合併，`Doc分享點名需求/` 空資料夾未沿用）
  - `01-LaTeX/`（原 productivity/LaTeX學習/）— LaTeX 入門教學筆記
  - `02-VsCode/`（原 shortcut/）— 工具快捷鍵筆記（如 `vscode.md`）
  - `03-Ｗhimsical/`（原 productivity/Ｗhimsical/）— Whimsical（畫流程圖／心智圖工具）的教學截圖整理成的使用說明
- **05-trash-can/**（原 trash-can/，原 垃圾桶）— `sub-daily-check` 保守判斷後搬移的過期檔案，保留原始相對路徑，可手動找回
- **template/** 已移除（原本放可直接複製使用的模板檔案，目前沒有內容）
- **.claude/skills/** — core-daily-sync（依序執行 sub-daily-check、sub-apple-sync）、sub-daily-check（掃描 `03-schedule/` 整理待辦）、sub-apple-sync（每日行程本機自動化，`sub-apple-sync` 是 `ios-sync` 與 `notes-sync` 合併後的統一名稱，用 osascript 一次處理 Calendar/Reminders/Notes 三個 App，不需要本機 Mac 開機才能跑的部分見 core-cloud-sync）、core-cloud-sync（雲端版一次跑完入口，依序執行 sub-daily-check、sub-caldav-sync、sub-notion-action-sync，設計給 `.github/workflows/cloud-sync.yml` 每天排程觸發，也可手動測試）、sub-caldav-sync（把有明確時間的任務透過 CalDAV 直連寫進 iCloud「daily」行事曆，不需要本機 Mac；Reminders/Notes 沒有可用的雲端 API，這兩項仍然只能靠 sub-apple-sync 本機處理，原因見該 skill 的 SKILL.md）、sub-notion-action-sync（把 `02-zettelkasten/03-Calendar/<date>/tasks.json` 逐筆單向鏡像進 Notion「睿恩的行動任務庫（Action）」資料庫，一筆任務一列，`專案項目`（固定掛 LifeOs）／`行動狀態`（建立時給預設值）留給使用者在 Notion 上手動維護、腳本不會覆蓋；被 core-cloud-sync 呼叫，也可單獨手動觸發）、sub-notion-sync（Pilot——把 `02-zettelkasten/01-Inbox/` 的卡片跟 Notion 資料庫雙向同步：push 把 repo 的 .md 卡片建立/更新到 Notion，pull 把 Notion 上新建的頁面抓回來變成 .md 卡片；目前只手動觸發，還沒排程、也還沒掛進 core-daily-sync）、core-structure-sync（文件與資料夾結構同步）、core-screenshot-notes（把教學影片截圖＋筆記整理成圖文並茂的使用說明／學習筆記，內部依序呼叫 sub-screenshot-rename、sub-screenshot-writer 兩個子 skill）、core-transcript-fix（修正任何逐字稿的語音辨識錯誤，定位到檔案即可直接處理，不新增或刪減內容）、core-init-latex（建立 LaTeX 格式速查範例檔）、core-latex-tidy（整理 xelatex 編譯產生的中間檔）。常直接手動呼叫的入口 skill 加上 `core-` 前綴，平常不會直接呼叫、只被入口 skill 依序呼叫的子 skill 加上 `sub-` 前綴
- **.github/workflows/** — `cloud-sync.yml`：每天台灣時間 06:00（UTC 22:00）在 GitHub Actions 排程觸發 `/core-cloud-sync`，也可手動 workflow_dispatch 測試；需要 `CLAUDE_CODE_OAUTH_TOKEN`、`APPLE_ID_EMAIL`、`APPLE_APP_SPECIFIC_PASSWORD`、`NOTION_API_KEY`、`NOTION_ACTION_DATABASE_ID`（後者只有 state file 還沒快取 `_dataSourceId` 時才會用到，當保險用）五個 GitHub Secrets

## 慣例

- 陪讀教材的 `.tex` 檔採用 `ctex` + `xelatex` 排版中文，前導碼慣例：

  ```latex
  \documentclass{article}
  \usepackage{ctex}

  \begin{document}
  % 內容
  \end{document}
  ```

- `DocOutline` 擴充套件會把 Skim 的 PDF 螢光筆重點，依格式（title/section/paragraph/quote）插入到目前聚焦的 `.tex` 檔案中，用於快速產出陪讀教材。
- 第一層資料夾用 `NN-name` 編號前綴排序，第二層開始維持中文，技術類子資料夾（如 `church-life/`、`software-project/`）維持英文 kebab-case。實際在跑的程式碼專案 `01-main-project/software-project/DocOutline/` 內部維持英文，因為改名牽動 package.json、tsconfig、`.vscode/launch.json` 等設定，風險比純筆記資料夾高很多。

## Claude Code 設定檔

- `.claude/settings.json` — 專案層級設定，會進 git、跟大家共享。目前主要放 `permissions.allow`：哪些工具呼叫不用每次跳出來問（例如允許讀取所有檔案、只能寫入 `02-zettelkasten/03-Calendar/`、`03-schedule/`、`05-trash-can/`，允許跑 `mv`/`mkdir`/`date`/`shasum` 及同步腳本）。標準 JSON 不支援註解，不能在裡面寫 `//` 或 `/* */`。
- `.claude/settings.local.json` — 個人本機設定，不進 git（通常在 `.gitignore`），用來加只有自己想要、不想影響其他協作者的額外權限或設定。

## 文件同步

`README.md`（人看的場景總覽）跟這份文件的「資料夾結構」章節必須跟實際內容保持一致。新增、刪除、改名資料夾時，不要只改其中一份——用 `.claude/skills/core-structure-sync/` 這個 skill 偵測落差、詢問使用者原因，再同步更新兩份文件。
