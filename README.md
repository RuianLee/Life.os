# Life.os

brianlee 的個人 Life OS：管理信仰/召會生活、個人目標、每日行程、側專案開發的筆記與自動化工具。

## 使用
**產生行程待辦**
- 在專案目錄下開 Claude Code，輸入 `/core-daily-sync`：掃描 `03-schedule/` 裡雜亂的行程資料（截圖、課表、公告），整理成 `02-zettelkasten/03-Calendar/<日期>/<日期>.md`（只放當天待辦）＋結構化 `tasks.json`
- 同步到 Calendar.app / Reminders.app / Notes.app（經 iCloud 到 iPhone/iPad）。詳細操作與常見狀況見 [00-user-guide/訂定每日行程.md](00-user-guide/訂定每日行程.md)。
- 想看更遠的規劃（年計劃／未來至少 3 個月的月計劃／未來 7 天的週計劃），看常駐更新的 [03-schedule/00-計劃總覽.md](03-schedule/00-計劃總覽.md)。
- 早上不方便開電腦時，`.github/workflows/cloud-sync.yml` 會每天台灣時間 06:00 自動在 GitHub Actions 跑 `/core-cloud-sync`：一樣整理 `02-zettelkasten/03-Calendar/`，並透過 CalDAV 直連把有明確時間的任務寫進 iCloud「daily」行事曆，同時把待辦逐筆單向鏡像進 Notion「睿恩的行動任務庫（Action）」資料庫，不需要本機 Mac。Reminders/Notes 沒有可用的雲端 API，仍然只能靠手動跑 `/core-daily-sync` 同步。

**整理讀經陪讀**
- [01-main-project/church-life/聖經陪讀/製作自己的聖經陪讀教材/](01-main-project/church-life/聖經陪讀/製作自己的聖經陪讀教材/) — 正在製作中的個人陪讀教材，LaTeX（`ctex` + `xelatex`）排版中文。
- [01-main-project/church-life/聖經陪讀/第一次陪讀聖經就上手/](01-main-project/church-life/聖經陪讀/第一次陪讀聖經就上手/) — 既有的讀經小組培訓參考資料（doc/pdf/pptx）。
- 想查 LaTeX 語法速查表、或編譯完想整理資料夾，見 [00-user-guide/LaTeX小工具.md](00-user-guide/LaTeX小工具.md)。

**整理召會生活信息逐字稿**
- 手機錄音轉文字後貼進 [01-main-project/church-life/美地展/](01-main-project/church-life/美地展/) 或 [01-main-project/church-life/海外開展/](01-main-project/church-life/海外開展/) 底下的檔案，定位到該檔案輸入 `/core-transcript-fix`，自動修正語音辨識的同音字、斷句、召會慣用語、經節等錯誤（不新增或刪減內容）。詳見 [00-user-guide/修正逐字稿.md](00-user-guide/修正逐字稿.md)。

**記卡片、同步 Notion（第二大腦，卡片盒筆記法）**
- 用 `node 02-zettelkasten/00-Scirpt/new-card.js` 在終端機互動式建立一張新卡片（標題／筆記類型／tag），存進 [02-zettelkasten/01-Inbox/](02-zettelkasten/01-Inbox/)；之後再一次性批次分類到 Atlas/Calendar/Card/Extra/Source/Space（ACCESS 結構）。
- 輸入 `/sub-notion-sync` 把 Inbox 卡片跟 Notion 資料庫雙向同步：push 把 .md 卡片建立/更新到 Notion，pull 把在 Notion 上新建的頁面抓回來變成 .md 卡片。目前是 Pilot，只手動觸發。詳見 [00-user-guide/Notion同步.md](00-user-guide/Notion同步.md)。
- [02-zettelkasten/00-ReadMe.md](02-zettelkasten/00-ReadMe.md) — 興趣、語言、職涯方向、軟體相關、召會成全的總覽，含短期年度目標與「目前每日計劃」固定表格。

**同步姊妹的行程表到她自己的 iPhone**
- 吳莉雯姊妹用手機上的 iOS 捷徑，把整週行程截圖/PDF 直接上傳到 [03-schedule/02-吳莉雯/](03-schedule/02-吳莉雯/)，一上傳就自動觸發 `.github/workflows/guest-schedule-sync.yml` 跑 `/core-guest-schedule-sync`：逐日拆解半小時時間區塊、合併相鄰同名稱區塊成一筆事件，透過 CalDAV 直接寫進她自己的 iCloud 行事曆，她完全不用碰 GitHub。這條線跟 brianlee 自己的每日行程/Notion pipeline 完全隔離，是專為她寫死的 MVP，不是通用多租戶系統。

**整理教學截圖成筆記**
- 看教學影片截了一堆圖，輸入 `/core-screenshot-notes`，會依序把截圖改成看得懂的檔名（`NN_主題-重點.png`）並寫成圖文並茂的使用說明。詳見 [00-user-guide/截圖整理成筆記.md](00-user-guide/截圖整理成筆記.md)，範例見 [04-tools/03-Ｗhimsical/使用說明.md](04-tools/03-Ｗhimsical/使用說明.md)。

**正在學習**
- [04-tools/01-LaTeX/LaTeX入門教學.md](04-tools/01-LaTeX/LaTeX入門教學.md)
- [04-tools/03-Ｗhimsical/使用說明.md](04-tools/03-Ｗhimsical/使用說明.md) — 畫流程圖／心智圖工具 Whimsical 的使用說明

## Skill 一覽

| Skill | 用途 | 呼叫方式 |
|---|---|---|
| `core-daily-sync` | 手動「一次跑完」入口：依序執行 sub-daily-check + sub-apple-sync | 手動 `/core-daily-sync` |
| `sub-daily-check` | 掃描 `03-schedule/`，整理今天/明天/本週待辦寫入 `02-zettelkasten/03-Calendar/<date>/`，過期檔案保守搬到 `05-trash-can/` | 被 core-daily-sync 呼叫，也可單獨 `/sub-daily-check` |
| `sub-apple-sync` | 把 sub-daily-check 產出的 tasks.json 同步到 Calendar/Reminders/Notes（經 iCloud 到 iPhone/iPad） | 被 core-daily-sync 呼叫，也可單獨 `/sub-apple-sync` |
| `core-cloud-sync` | 雲端版一次跑完入口：依序執行 sub-daily-check + sub-caldav-sync + sub-notion-action-sync，設計給 GitHub Actions 每天排程觸發 | 被 `.github/workflows/cloud-sync.yml` 排程呼叫，也可手動 `/core-cloud-sync` |
| `sub-caldav-sync` | 把 tasks.json 裡有明確時間的任務透過 CalDAV 直連寫進 iCloud「daily」行事曆，不需要本機 Mac；Reminders/Notes 沒有可用的雲端 API，不處理 | 被 core-cloud-sync 呼叫，也可單獨 `/sub-caldav-sync` |
| `sub-notion-action-sync` | 把 tasks.json 逐筆單向鏡像進 Notion「睿恩的行動任務庫（Action）」資料庫（行動任務卡片／截止日／專案項目／行動狀態），`專案項目`／`行動狀態` 留給使用者在 Notion 上手動維護、不會被覆蓋 | 被 core-cloud-sync 呼叫，也可單獨 `/sub-notion-action-sync` |
| `sub-notion-sync` | Pilot——把 `02-zettelkasten/01-Inbox/` 的卡片跟 Notion 資料庫雙向同步（push 建立/更新、pull 抓回新頁面），還沒排程、也還沒掛進 core-daily-sync | 手動 `/sub-notion-sync` |
| `core-screenshot-notes` | 教學截圖＋筆記重點整理成圖文並茂的使用說明；依序呼叫 sub-screenshot-rename、sub-screenshot-writer | 手動 `/core-screenshot-notes` |
| `sub-screenshot-rename` | 把一批截圖依畫面內容改成看得懂的檔名（`NN_主題-重點.png`） | 被 core-screenshot-notes 呼叫，也可單獨 `/sub-screenshot-rename` |
| `sub-screenshot-writer` | 把已改好檔名的截圖＋筆記重點寫成圖文並茂的 md 筆記 | 被 core-screenshot-notes 呼叫，也可單獨 `/sub-screenshot-writer` |
| `core-structure-sync` | 偵測資料夾結構變動，詢問原因後同步更新 README.md 場景清單與 CLAUDE.md 資料夾結構章節 | 手動 `/core-structure-sync`，或任務中主動觸發 |
| `core-guest-schedule-sync` | 讀取吳莉雯姊妹上傳到 `03-schedule/02-吳莉雯/` 的整週行程截圖/PDF，拆解合併成行事曆事件，透過 CalDAV 寫進她自己的 iCloud 行事曆；跟 brianlee 自己的 pipeline 完全隔離 | 她上傳新檔案時被 `.github/workflows/guest-schedule-sync.yml` 自動觸發，也可手動 `/core-guest-schedule-sync`（支援 dry-run） |
| `core-transcript-fix` | 修正逐字稿的語音辨識錯誤（同音字、斷句、專有名詞誤植），不增刪內容 | 定位到逐字稿檔案後手動 `/core-transcript-fix` |
| `core-init-latex` | 建立一份可直接編譯的「LaTeX 格式範例.tex」速查表，收錄常用格式寫法 | 手動 `/core-init-latex` |
| `core-latex-tidy` | 整理 xelatex 編譯產生的中間檔（.aux/.log/.synctex.gz），依標題歸檔成獨立子資料夾 | 手動 `/core-latex-tidy` |

