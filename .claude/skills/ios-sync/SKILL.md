---
name: ios-sync
description: 把 daily-check 產出的 每日整理/<date>/tasks.json 同步到本機 Calendar.app / Reminders.app（經 iCloud 同步到 iPhone），用 行程/.ios-sync-state.json 做去重，重跑不會建立重複事件。
---

執行 iOS 行事曆/提醒事項同步。

## 步驟

1. 找出今天的 `每日整理/<today>/tasks.json`（`today` 用 `date +%F`）。如果不存在，先提醒使用者今天還沒跑過 `/daily-check`，不要自己臨時湊資料。
2. 執行：
   ```bash
   node .claude/skills/ios-sync/scripts/sync.js "每日整理/<today>/tasks.json"
   ```
3. 這個腳本的邏輯是固定的（不需要你自己判斷要不要重複建立）：
   - 每個任務用 `contentHash` 比對 `行程/.ios-sync-state.json` 裡的紀錄：沒看過就新建、內容沒變就略過、內容變了就用存好的 Apple id 直接更新既有事件，不會新建重複的一筆。
   - 有明確時間的任務進 Calendar.app 的「Life.os」行事曆；只有日期的任務進 Reminders.app 的「Life.os」清單。
   - 任務如果從 tasks.json 消失（日期過了或來源檔案被 daily-check 搬進 垃圾桶），會自動把對應的提醒標記完成、或刪除對應的行事曆事件。
4. 把腳本印出的統計（新增/更新/略過/清除各幾筆）用一句話回報給使用者，不要重新複述每一筆任務內容。

## 注意事項

- 第一次執行時 macOS 可能會跳出「是否允許自動化控制 Calendar / Reminders」的系統對話框，這需要使用者手動允許一次，你無法代為點擊；如果腳本因為權限被拒而報錯，明確告訴使用者去「系統設定 > 隱私權與安全性 > 自動化」開啟權限，然後重跑。
- 不要手動修改 `行程/.ios-sync-state.json`，它是腳本自己維護的狀態檔。
