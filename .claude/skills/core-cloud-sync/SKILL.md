---
name: core-cloud-sync
description: 雲端版「一次跑完」入口——依序執行 sub-daily-check（整理 schedule/ 待辦）、sub-caldav-sync（透過 CalDAV 把有時間的任務直接寫進 iCloud Calendar，不需要本機 Mac）。設計給 GitHub Actions 每天排程自動觸發，也可以手動輸入 /core-cloud-sync 測試。跟 core-daily-sync 平行、互不呼叫：core-daily-sync 是本機手動路徑（含 Reminders/Notes），core-cloud-sync 是雲端自動路徑（只有 Calendar，因為 Reminders/Notes 沒有可用的雲端 API）。
---

依序完整跑一次雲端版每日整理流程：

1. 執行 `sub-daily-check` 的完整邏輯（見 `.claude/skills/sub-daily-check/SKILL.md`）：掃描 `schedule/`、`second-brain/主題統整.md`，更新/確認 `daily-plan/<today>/<today>.md` 與 `tasks.json`，保守搬移過期檔案，寫 log。這步跟本機版完全一樣，不需要任何 Apple 相關權限。
2. 執行 `sub-caldav-sync` 的完整邏輯（見 `.claude/skills/sub-caldav-sync/SKILL.md`）：
   ```bash
   node .claude/skills/sub-caldav-sync/scripts/sync_caldav.js "daily-plan/<today>/tasks.json"
   ```
   需要 `APPLE_ID_EMAIL`、`APPLE_APP_SPECIFIC_PASSWORD` 兩個環境變數（GitHub Actions 裡從 Secrets 帶入，手動測試時使用者自己 export）。只會把有明確時間的任務（`type: "event"`）寫進 iCloud「daily」行事曆，Reminders 跟 Notes 不會被這條路徑處理（原因見 sub-caldav-sync 的 SKILL.md 與腳本檔頭註解）。
**不要自己執行 `git add`/`git commit`/`git push`**（這些指令不在 `.claude/settings.json` 的允許清單裡，故意不給——跟本機版 `/core-daily-sync` 一樣，commit 交給人或外層流程決定，這個 skill 只負責把檔案準備好）。在 GitHub Actions 裡，commit + push 是 `.github/workflows/cloud-sync.yml` 最後一個獨立步驟做的事，不需要也不應該由這個 skill 處理；本機手動跑也一樣，把 commit 留給使用者自己按。

最後用 2-3 句話總結：今天整理了哪些待辦、Calendar 新增/更新/略過/清除各幾筆。並提醒使用者：Reminders 跟 Notes 沒有被這條雲端路徑處理，想要完整同步（含 Reminders/Notes）仍然要在本機手動跑 `/core-daily-sync`。不要重複貼原始輸出。
