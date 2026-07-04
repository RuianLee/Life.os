# Life.os

這是 brianlee 的個人 Life OS 專案，用來管理生活/信仰/職涯/側專案/每日行程的筆記與自動化工具。內容以中文為主，資料夾名稱也已全部改成中文（僅實際在跑的程式碼專案 `小專案/DocOutline/` 刻意保留英文）。

給「人」看的總覽（依場景列出這個專案可以幹嘛）見根目錄 `README.md`；這份文件是給 Claude 的資料夾結構與慣例說明。

## 資料夾結構

- **召會生活/**（原 ChurchLife）— 召會生活相關文件
  - `聖經陪讀/`（原 BibleStudy）— 讀經與陪讀教材
    - `第一次陪讀聖經就上手/` — 既有的讀經小組培訓資料（doc/pdf/pptx）
    - `製作自己的聖經陪讀教材/` — 正在製作中的個人陪讀教材，用 LaTeX（`.tex`）排版，例如 `約翰福音.tex`
  - `家聚會/`（原 FamilyGathering）— 家聚會相關資料
  - `屬靈書報追求/`（原 SpiritualStudy）— 書報追求相關（目前為空）
- **人生大方向/**（原 Goal）— 目標與方向筆記
  - `興趣/interest.md`（原 Interest）
  - `語言/language.md`（原 Language）
  - `職涯/professional.md`（原 Professional）
- **快捷鍵/**（原 Keymap）— 工具快捷鍵筆記（如 `vscode.md`）
- **行程/**（原 Schedule）— 每日行程的原始資料（截圖、課表、公告等），是 `daily-check` skill 的輸入來源；`schedule-log.md` 記錄每次整理/搬移的判斷，`.ios-sync-state.json` / `.notes-sync-state.json` 是不進 git 的本機同步狀態
- **每日整理/<YYYY-MM-DD>/**（原 Daily）— `daily-check` 的產出：人讀的 `<日期>.md` + 結構化 `tasks.json`
- **使用手冊/**（原 SOP）— 特定功能的操作手冊（給人看的「怎麼用」），例如 `每日行程同步-SOP.md`
- **小專案/**（原 SideProduct）— 側專案
  - `技術棧.md` — 跨專案的技術堆疊總覽（Claude Code skill 自動化 / VSCode Extension / LaTeX 各用什麼技術），日後寫新小工具時的選型參考
  - `DocOutline/` — 自製 VSCode 擴充套件：把 Skim 標註的 PDF 螢光筆重點轉成 LaTeX 內容，用於製作陪讀教材。詳見 `小專案/DocOutline/ReadMe.md`。這是實際在跑的程式碼專案（package.json/tsconfig 等都寫死路徑），刻意保留英文資料夾名稱，沒有跟著整批改成中文
  - `每日同步技術文件/`（原 DailySkillTech）— 每日行程同步那組 skill 的技術實作文件（架構、踩過的坑）
- **工具/**（原 Tools）
  - `LaTeX學習/`（原 Tools/Latex）— LaTeX 入門教學筆記
- **垃圾桶/**（原 Trash）— `daily-check` 保守判斷後搬移的過期檔案，保留原始相對路徑，可手動找回
- **.claude/skills/** — daily-check、daily-sync、ios-sync、notes-sync（每日行程自動化）、structure-sync（文件與資料夾結構同步）

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
- 資料夾名稱以中文為主，但實際在跑的程式碼專案（目前是 `小專案/DocOutline/`）刻意維持英文，因為改名牽動 package.json、tsconfig、`.vscode/launch.json` 等設定，風險比純筆記資料夾高很多。

## 文件同步

`README.md`（人看的場景總覽）跟這份文件的「資料夾結構」章節必須跟實際內容保持一致。新增、刪除、改名資料夾時，不要只改其中一份——用 `.claude/skills/structure-sync/` 這個 skill 偵測落差、詢問使用者原因，再同步更新兩份文件。
