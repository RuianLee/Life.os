---
name: daily-sync
description: 手動的「一次跑完」入口——依序執行 daily-check（整理 行程/ 待辦）、apple-sync（同步到 Calendar/Reminders/Notes）。沒有排程，完全手動觸發。
---

依序完整跑一次每日整理流程（沒有自動排程，使用者手動輸入 `/daily-sync` 才會執行）：

1. 執行 `daily-check` 的完整邏輯（見 `.claude/skills/daily-check/SKILL.md`）：掃描 `行程/`，更新/確認 `每日整理/<today>/<today>.md` 與 `tasks.json`，保守搬移過期檔案，寫 log。
2. 執行 `apple-sync` 的完整邏輯（見 `.claude/skills/apple-sync/SKILL.md`）：
   ```bash
   node .claude/skills/apple-sync/scripts/sync.js "每日整理/<today>/tasks.json"
   node .claude/skills/apple-sync/scripts/sync_notes.js "每日整理/<today>/tasks.json" "<today>"
   ```
   同步到 Calendar.app / Reminders.app / Notes.app。

最後用 3-5 句話總結：今天/本週有哪些重點待辦、Calendar 與 Reminders 各新增/更新/略過幾筆、Notes 是新建還是已存在略過。不要重複貼原始輸出。
