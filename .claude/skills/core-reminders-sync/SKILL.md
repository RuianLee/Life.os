---
name: core-reminders-sync
description: 輕量手動入口——只把已經算好的 02-zettelkasten/03-Calendar/<today>/tasks.json 同步到 Reminders.app／Notes.app，不重新跑 sub-daily-check、也不碰 Calendar（Calendar 交給雲端 core-cloud-sync 處理）。適合「早上手機已經自動同步過 Calendar，現在打開電腦只想順手把 Reminders/Notes 補齊」的場景。想要完整重新整理待辦（含掃描 schedule/ 新檔案），用 /core-daily-sync。
---

只同步 Reminders/Notes，不重新分析待辦、不碰 Calendar：

1. `git pull`，確保拿到雲端 `core-cloud-sync` 今天可能已經產生的最新 `02-zettelkasten/03-Calendar/<today>/tasks.json`（`today` 用 `date +%F`）。
2. 找 `02-zettelkasten/03-Calendar/<today>/tasks.json`。**如果不存在，不要自己臨時湊資料**——提醒使用者今天還沒有任何一條路徑（雲端或本機）跑過 sub-daily-check，請先跑 `/core-daily-sync`（本機完整版）或去手機觸發雲端 `core-cloud-sync`，再回來用這個 skill。
3. 依序執行：
   ```bash
   node .claude/skills/sub-apple-sync/scripts/sync.js "02-zettelkasten/03-Calendar/<today>/tasks.json" --reminders-only
   node .claude/skills/sub-apple-sync/scripts/sync_notes.js "02-zettelkasten/03-Calendar/<today>/tasks.json" "<today>"
   ```
   `sync.js` 的 `--reminders-only` 只處理 Reminders，完全不新建/更新/刪除 Calendar 事件（那是雲端的責任），去重、每個提醒該進哪個清單等邏輯，跟 `sub-apple-sync/SKILL.md` 描述的完全一樣，不需要另外判斷。
   `sync_notes.js` 的覆寫確認邏輯（已存在時要先問使用者、使用者同意才加 `--force`）也完全比照 `sub-apple-sync/SKILL.md` 的說明。
4. 用一兩句話回報 Reminders 新增/更新/略過/清除幾筆、Notes 是新建還是已存在。不用重複貼 tasks.json 內容，也不用提 Calendar（這個 skill 本來就不管它）。
