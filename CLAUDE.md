# Life.os

這是 brianlee 的個人 Life OS 專案，用來管理生活/信仰/職涯/側專案/每日行程的筆記與自動化工具。內容以中文為主：第一層資料夾統一改用英文 kebab-case 命名（例如 `church-life/`、`second-brain/`），第二層以下維持中文。

給「人」看的總覽（依場景列出這個專案可以幹嘛）見根目錄 `README.md`；這份文件是給 Claude 的資料夾結構與慣例說明。

## 資料夾結構

- **church-life/**（原 召會生活）— 召會生活相關文件
  - `聖經陪讀/` — 讀經與陪讀教材
    - `第一次陪讀聖經就上手/` — 既有的讀經小組培訓資料（doc/pdf/pptx）
    - `製作自己的聖經陪讀教材/` — 正在製作中的個人陪讀教材，用 LaTeX（`.tex`）排版，例如 `約翰福音.tex`
  - `家聚會/` — 家聚會相關資料
  - `書報追求/` — 書報追求相關（目前為空）
  - `海外開展/` — 海外開展見證/分享的逐字稿，例如 `26青短海外開展見證.md`（青職短訓期間的見證逐字稿，語音辨識初稿，尚未修正）
  - `美地展/` — 特定信息（教師交通等）的逐字稿與手寫綱要整理，例如 `260708.md` 是青職短訓期間某堂「美地展啟」教師交通的逐字稿＋綱要；語音辨識錯誤用 `core-transcript-fix` skill 修正
- **second-brain/**（原 知識主題）— 目標與方向筆記
  - `主題統整.md` — 總覽（興趣、語言、職涯方向、軟體相關、召會成全五大區塊）
  - `可視化教學/`、`生產力/`、`派報/`、`英文/`、`書報追求/`、`健身/`、`剪輯攝影/`、`軟體方法論/`、`軟體開發/`、`衝浪/`、`韓語/`、`攀岩/` — 對應總覽中各主題的分類容器，目前為空。構想是仿照某本書「先列出人生 12 個主題」的做法收集資料，未來考慮在裡面實行卡片盒筆記法，尚在構思中
  - `閱讀寫作/讀書輸入輸出-長文章/` — 閱讀與寫作方法，目前已有 `【教學】讀書筆記怎麼寫？顛覆舊觀念的筆記和寫作法/`、`卡片盒筆記法的數位實戰指南/` 兩個子資料夾
  - `Blog/` — 寫部落格文章的草稿/發想，目前為空
- **shortcut/**（原 軟體快捷）— 工具快捷鍵筆記（如 `vscode.md`）
- **schedule/**（原 管理行程）— 每日行程的原始資料（截圖、課表、公告等），是 `sub-daily-check` skill 的輸入來源；`schedule-log.md` 記錄每次整理/搬移的判斷，`.apple-sync-state.json` / `.apple-sync-notes-state.json` 是不進 git 的本機同步狀態
  - `青職短訓_預訓/`、`青職短訓_學員/` — 青職短訓分預備期與學員期兩階段，資料分開存放
  - `休開/` — 文山一大區的休訓（讀經、新約總論）進度資料
- **daily-plan/<YYYY-MM-DD>/**（原 每日重點整理）— `sub-daily-check` 的產出：人讀的 `<日期>.md` + 結構化 `tasks.json`
- **user-guide/**（原 使用手冊）— 特定功能的操作手冊（給人看的「怎麼用」），例如 `訂定每日行程.md`
- **project/**（原 延伸專案）— 側專案
  - `技術棧.md` — 跨專案的技術堆疊總覽（Claude Code skill 自動化 / VSCode Extension / LaTeX 各用什麼技術），日後寫新小工具時的選型參考
  - `DocOutline/` — 自製 VSCode 擴充套件：把 Skim 標註的 PDF 螢光筆重點轉成 LaTeX 內容，用於製作陪讀教材。詳見 `project/DocOutline/ReadMe.md`。這是實際在跑的程式碼專案（package.json/tsconfig 等都寫死路徑），刻意保留英文資料夾名稱
  - `同步排程到蘋果軟件/` — 每日行程同步那組 skill 的技術實作文件（架構、踩過的坑）
  - `行事曆排程/` — 研究筆記階段，研究如何用比對邏輯（新資料 vs 既有行事曆事件、或 vs 標準行程樣板）減少 core-daily-sync 每次都要重新讓 LLM 判斷的 token 消耗，並搭配 VSCode 面板統一檢視/確認後再派發，目前尚未寫程式，見 `行事曆排程/研究筆記.md`
- **productivity/**（原 生產力工具）
  - `LaTeX學習/` — LaTeX 入門教學筆記
  - `Ｗhimsical/` — Whimsical（畫流程圖／心智圖工具）的教學截圖整理成的使用說明，目前正在學習使用這個工具
  - `Doc分享點名需求/` — 新增的空資料夾，用途待補充
- **template/** — 新增，放可以直接複製過去使用的模板檔案，目前為空
- **trash-can/**（原 垃圾桶）— `sub-daily-check` 保守判斷後搬移的過期檔案，保留原始相對路徑，可手動找回
- **.claude/skills/** — core-daily-sync（依序執行 sub-daily-check、sub-apple-sync）、sub-daily-check（掃描 `schedule/` 整理待辦）、sub-apple-sync（每日行程自動化，`sub-apple-sync` 是 `ios-sync` 與 `notes-sync` 合併後的統一名稱，一次處理 Calendar/Reminders/Notes 三個 App）、core-structure-sync（文件與資料夾結構同步）、core-screenshot-notes（把教學影片截圖＋筆記整理成圖文並茂的使用說明／學習筆記，內部依序呼叫 sub-screenshot-rename、sub-screenshot-writer 兩個子 skill）、core-transcript-fix（修正任何逐字稿的語音辨識錯誤，定位到檔案即可直接處理，不新增或刪減內容）、core-init-latex（建立 LaTeX 格式速查範例檔）、core-latex-tidy（整理 xelatex 編譯產生的中間檔）。常直接手動呼叫的入口 skill 加上 `core-` 前綴，平常不會直接呼叫、只被入口 skill 依序呼叫的子 skill 加上 `sub-` 前綴

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
- 第一層資料夾統一用英文 kebab-case 命名（例如 `church-life/`、`second-brain/`），第二層以下維持中文。實際在跑的程式碼專案 `project/DocOutline/` 內部維持英文，因為改名牽動 package.json、tsconfig、`.vscode/launch.json` 等設定，風險比純筆記資料夾高很多。

## Claude Code 設定檔

- `.claude/settings.json` — 專案層級設定，會進 git、跟大家共享。目前主要放 `permissions.allow`：哪些工具呼叫不用每次跳出來問（例如允許讀取所有檔案、只能寫入 `daily-plan/`、`schedule/`、`trash-can/`，允許跑 `mv`/`mkdir`/`date`/`shasum` 及同步腳本）。標準 JSON 不支援註解，不能在裡面寫 `//` 或 `/* */`。
- `.claude/settings.local.json` — 個人本機設定，不進 git（通常在 `.gitignore`），用來加只有自己想要、不想影響其他協作者的額外權限或設定。

## 文件同步

`README.md`（人看的場景總覽）跟這份文件的「資料夾結構」章節必須跟實際內容保持一致。新增、刪除、改名資料夾時，不要只改其中一份——用 `.claude/skills/core-structure-sync/` 這個 skill 偵測落差、詢問使用者原因，再同步更新兩份文件。
