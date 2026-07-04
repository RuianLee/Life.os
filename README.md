# Life.os

brianlee 的個人 Life OS：管理信仰/召會生活、個人目標、每日行程、側專案開發的筆記與自動化工具。內容以中文為主，資料夾名稱也大多改成中文了（`Goal/` 還在想中文名稱，暫時保留英文）。

這份文件是給「人」看的總覽，依「我想做什麼」的場景列出這個專案目前能幫上什麼忙。專案給 Claude 看的規則與資料夾慣例在 `CLAUDE.md`；這裡只列「有什麼」跟「去哪裡找」。

## 依場景查：這個專案可以幹嘛

**我想知道今天/這週有什麼行程待辦**
在專案目錄下開 Claude Code，輸入 `/daily-sync`：掃描 `行程/` 裡雜亂的行程資料（截圖、課表、公告），整理成 `每日整理/<日期>/` 底下人讀的清單，同步到 Calendar.app / Reminders.app / Notes.app（經 iCloud 到 iPhone/iPad）。也可以只跑其中一步：`/daily-check`、`/ios-sync`、`/notes-sync`。詳細操作與常見狀況見 [SOP/每日行程同步-SOP.md](SOP/每日行程同步-SOP.md)。

**我想製作/整理讀經陪讀教材**
- [召會生活/BibleStudy/製作自己的聖經陪讀教材/](召會生活/BibleStudy/製作自己的聖經陪讀教材/) — 正在製作中的個人陪讀教材，LaTeX（`ctex` + `xelatex`）排版中文。
- [小專案/DocOutline/](小專案/DocOutline/) — 自製 VSCode extension，把 Skim 標註的 PDF 螢光筆重點依格式（title/section/paragraph/quote）轉成 LaTeX 插入 `.tex` 檔案。用法與架構見其 [ReadMe.md](小專案/DocOutline/ReadMe.md)。
- [召會生活/BibleStudy/第一次陪讀聖經就上手/](召會生活/BibleStudy/第一次陪讀聖經就上手/) — 既有的讀經小組培訓參考資料（doc/pdf/pptx）。

**我想準備/整理家聚會**
[召會生活/FamilyGathering/](召會生活/FamilyGathering/)

**我想記錄與追蹤個人目標方向**
[Goal/興趣/interest.md](Goal/興趣/interest.md)（興趣）、[Goal/語言/language.md](Goal/語言/language.md)（語言學習）、[Goal/職涯/professional.md](Goal/職涯/professional.md)（職涯方向）。

**我想學 LaTeX 或查工具用法**
[工具/LaTeX學習/LaTeX入門教學.md](工具/LaTeX學習/LaTeX入門教學.md)、[快捷鍵/vscode.md](快捷鍵/vscode.md)（VSCode 快捷鍵）。

**我想知道側專案做到哪、怎麼做出來的（技術細節、已知限制）**
[小專案/DocOutline/ReadMe.md](小專案/DocOutline/ReadMe.md)、[小專案/每日同步技術文件/ReadMe.md](小專案/每日同步技術文件/ReadMe.md)。

**我想找回被判斷為過期而搬走的檔案**
[垃圾桶/](垃圾桶/) — `/daily-check` 保守判斷後搬移的檔案，路徑結構跟原本一樣，手動搬回即可。

## 專案裡的幾條線

- **信仰/召會生活** — `召會生活/`
- **個人目標管理** — `Goal/`
- **每日行程自動化** — `行程/` + `每日整理/` + `.claude/skills/`（daily-check、daily-sync、ios-sync、notes-sync）+ `SOP/`
- **側專案開發** — `小專案/`
- **工具與學習筆記** — `工具/`、`快捷鍵/`

## 文件之間的分工

- **README.md**（這份）— 給人看的總覽，依場景列出「這個專案可以幹嘛」，是入口。
- **CLAUDE.md** — 給 Claude 看的專案說明與資料夾慣例，Claude 每次工作會自動讀取，不需要人手動查。
- **SOP/*.md** — 特定功能「怎麼用」的操作手冊（給人）。
- **小專案/*/ReadMe.md** — 個別側專案的技術文件（架構、怎麼做出來的、已知限制）。

新增功能或搬動資料夾時，`.claude/skills/structure-sync/` 這個 skill 會發現落差、問你原因，再同步更新這份文件與 `CLAUDE.md` 的結構章節，避免文件跟實際內容脫節。
