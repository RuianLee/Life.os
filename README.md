# Life.os

brianlee 的個人 Life OS：管理信仰/召會生活、個人目標、每日行程、側專案開發的筆記與自動化工具。

## 使用
**產生行程待辦**
- 在專案目錄下開 Claude Code，輸入 `/core-daily-sync`：掃描 `schedule/` 裡雜亂的行程資料（截圖、課表、公告），整理成 `daily-plan/<日期>/<日期>.md`（只放當天待辦）＋結構化 `tasks.json`
- 同步到 Calendar.app / Reminders.app / Notes.app（經 iCloud 到 iPhone/iPad）。詳細操作與常見狀況見 [user-guide/訂定每日行程.md](user-guide/訂定每日行程.md)。
- 想看更遠的規劃（年計劃／未來至少 3 個月的月計劃／未來 7 天的週計劃），看常駐更新的 [schedule/計劃總覽.md](schedule/計劃總覽.md)。
- 早上不方便開電腦時，`.github/workflows/cloud-sync.yml` 會每天台灣時間 06:00 自動在 GitHub Actions 跑 `/core-cloud-sync`：一樣整理 `daily-plan/`，並透過 CalDAV 直連把有明確時間的任務寫進 iCloud「daily」行事曆，不需要本機 Mac。Reminders/Notes 沒有可用的雲端 API，仍然只能靠手動跑 `/core-daily-sync` 同步。

**整理讀經陪讀**
- [church-life/聖經陪讀/製作自己的聖經陪讀教材/](church-life/聖經陪讀/製作自己的聖經陪讀教材/) — 正在製作中的個人陪讀教材，LaTeX（`ctex` + `xelatex`）排版中文。
- [church-life/聖經陪讀/第一次陪讀聖經就上手/](church-life/聖經陪讀/第一次陪讀聖經就上手/) — 既有的讀經小組培訓參考資料（doc/pdf/pptx）。

**整理召會生活信息逐字稿**
- 手機錄音轉文字後貼進 [church-life/美地展/](church-life/美地展/) 或 [church-life/海外開展/](church-life/海外開展/) 底下的檔案，定位到該檔案輸入 `/core-transcript-fix`，自動修正語音辨識的同音字、斷句、召會慣用語、經節等錯誤（不新增或刪減內容）。

**記錄與追蹤個人目標**
- 仿照「先列出人生 12 個主題」的做法逐一收集資料，分類容器依「行動」命名（比主題名稱更有動力）
- [second-brain/主題統整.md](second-brain/主題統整.md) — 興趣、語言、職涯方向、軟體相關、召會成全的總覽，含短期年度目標與「目前每日計劃」固定表格。底下 `創業事業經營/`、`文章閱讀寫作/`、`書報聖經追求/`、`物理引擎模擬/`、`生產力的養成/`、`自我生活紀錄/`、`設計模式教練/`、`軟體框架設計/`、`運動健身培養/`、`韓文學習考證/`

**維護個人網站（部落格/作品集）**
- [project/personal-site/](project/personal-site/) — Astro（AstroPaper 主題）架設的個人網站，部落格文章直接在裡面寫，另外也放 faith/journal/morning-revival/portfolio 等內容

**正在學習**
- [productivity/LaTeX學習/LaTeX入門教學.md](productivity/LaTeX學習/LaTeX入門教學.md)
- [productivity/Ｗhimsical/使用說明.md](productivity/Ｗhimsical/使用說明.md) — 畫流程圖／心智圖工具 Whimsical 的使用說明

**套用模板**
- [template/](template/) — 放可以直接複製過去使用的模板檔案（目前為空，陸續補充中）

## Skill 一覽

| Skill | 用途 | 呼叫方式 |
|---|---|---|
| `core-daily-sync` | 手動「一次跑完」入口：依序執行 sub-daily-check + sub-apple-sync | 手動 `/core-daily-sync` |
| `sub-daily-check` | 掃描 `schedule/`，整理今天/明天/本週待辦寫入 `daily-plan/<date>/`，過期檔案保守搬到 `trash-can/` | 被 core-daily-sync 呼叫，也可單獨 `/sub-daily-check` |
| `sub-apple-sync` | 把 sub-daily-check 產出的 tasks.json 同步到 Calendar/Reminders/Notes（經 iCloud 到 iPhone/iPad） | 被 core-daily-sync 呼叫，也可單獨 `/sub-apple-sync` |
| `core-cloud-sync` | 雲端版一次跑完入口：依序執行 sub-daily-check + sub-caldav-sync，設計給 GitHub Actions 每天排程觸發 | 被 `.github/workflows/cloud-sync.yml` 排程呼叫，也可手動 `/core-cloud-sync` |
| `sub-caldav-sync` | 把 tasks.json 裡有明確時間的任務透過 CalDAV 直連寫進 iCloud「daily」行事曆，不需要本機 Mac；Reminders/Notes 沒有可用的雲端 API，不處理 | 被 core-cloud-sync 呼叫，也可單獨 `/sub-caldav-sync` |
| `core-screenshot-notes` | 教學截圖＋筆記重點整理成圖文並茂的使用說明；依序呼叫 sub-screenshot-rename、sub-screenshot-writer | 手動 `/core-screenshot-notes` |
| `sub-screenshot-rename` | 把一批截圖依畫面內容改成看得懂的檔名（`NN_主題-重點.png`） | 被 core-screenshot-notes 呼叫，也可單獨 `/sub-screenshot-rename` |
| `sub-screenshot-writer` | 把已改好檔名的截圖＋筆記重點寫成圖文並茂的 md 筆記 | 被 core-screenshot-notes 呼叫，也可單獨 `/sub-screenshot-writer` |
| `core-structure-sync` | 偵測資料夾結構變動，詢問原因後同步更新 README.md 場景清單與 CLAUDE.md 資料夾結構章節 | 手動 `/core-structure-sync`，或任務中主動觸發 |
| `core-transcript-fix` | 修正逐字稿的語音辨識錯誤（同音字、斷句、專有名詞誤植），不增刪內容 | 定位到逐字稿檔案後手動 `/core-transcript-fix` |
| `core-init-latex` | 建立一份可直接編譯的「LaTeX 格式範例.tex」速查表，收錄常用格式寫法 | 手動 `/core-init-latex` |
| `core-latex-tidy` | 整理 xelatex 編譯產生的中間檔（.aux/.log/.synctex.gz），依標題歸檔成獨立子資料夾 | 手動 `/core-latex-tidy` |

