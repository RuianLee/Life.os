---
name: sub-apple-sync
description: 把 sub-daily-check 產出的 每日重點整理/<date>/tasks.json 同步到本機 Calendar.app / Reminders.app / Notes.app（都經 iCloud 同步到 iPhone/iPad）。用 管理行程/.apple-sync-state.json、管理行程/.apple-sync-notes-state.json 做去重，重跑不會建立重複事件或重複筆記。
---

執行 Apple 生態系同步（Calendar/Reminders/Notes 一次跑完）。

## 步驟

1. 找出今天的 `每日重點整理/<today>/tasks.json`（`today` 用 `date +%F`）。如果不存在，先提醒使用者今天還沒跑過 `/sub-daily-check`，不要自己臨時湊資料。
2. 依序執行兩支腳本：
   ```bash
   node .claude/skills/sub-apple-sync/scripts/sync.js "每日重點整理/<today>/tasks.json"
   node .claude/skills/sub-apple-sync/scripts/sync_notes.js "每日重點整理/<today>/tasks.json" "<today>"
   ```
3. `sync.js`（Calendar/Reminders）的邏輯是固定的（不需要你自己判斷要不要重複建立）：
   - 每個任務用 `contentHash` 比對 `管理行程/.apple-sync-state.json` 裡的紀錄：沒看過就新建、內容沒變就略過、內容變了就用存好的 Apple id 直接更新既有事件，不會新建重複的一筆。
   - 有明確時間的任務進 Calendar.app 的「Life.os」行事曆；只有日期的任務進 Reminders.app 的「Life.os」清單。
   - 任務如果從 tasks.json 消失（日期過了或來源檔案被 sub-daily-check 搬進 垃圾桶），會自動把對應的提醒標記完成、或刪除對應的行事曆事件。
4. `sync_notes.js`（Notes）的邏輯：
   - 用 `管理行程/.apple-sync-notes-state.json` 檢查當天日期的筆記是否已存在於 iCloud 帳號的「Life.os」資料夾。
   - 不存在就建立一則新筆記，標題是「`<date> 待辦`」，內容是依時間排序的條列文字（每個待辦一行）。
   - **已存在時預設不覆寫**。這時不要只是在最後的文字回報裡帶一句話問，要直接用 `AskUserQuestion` 工具跳出互動選項問使用者是否要覆蓋（選項至少要有「覆蓋」「不覆蓋」，並在問題描述提醒：覆蓋會蓋掉使用者手動轉成 checklist 後的勾選進度）。使用者選擇覆蓋後，才加 `--force` 重跑同一支指令：
     ```bash
     node .claude/skills/sub-apple-sync/scripts/sync_notes.js "每日重點整理/<today>/tasks.json" "<today>" --force
     ```
     沒有使用者確認前，不要自己加 `--force`。
5. 把兩支腳本印出的統計（Calendar/Reminders 新增/更新/略過/清除各幾筆；Notes 新建/已存在待確認/已覆蓋）用一兩句話回報給使用者，不要重新複述每一筆任務內容。也提醒使用者：**Notes.app 沒有辦法透過程式建立真正可勾選的 checklist**（AppleScript 沒有官方支援，實測 HTML 技巧會被 Notes 正規化成一般條列，勾選狀態不會保留）。如果使用者想要能打勾的清單，可以在 iPad/Mac 的備忘錄裡全選這些條列文字，點工具列的「打勾清單」格式化按鈕，就會變成真正的 checklist。真正「一開始就能打勾」的需求，Reminders.app 已經滿足了，Notes 比較適合當作「當天完整資訊的可讀筆記」。

## 注意事項

- 第一次執行時 macOS 可能會跳出「是否允許自動化控制 Calendar / Reminders / Notes」的系統對話框，這需要使用者手動允許一次，你無法代為點擊；如果腳本因為權限被拒而報錯，明確告訴使用者去「系統設定 > 隱私權與安全性 > 自動化」開啟權限，然後重跑。
- 不要手動修改 `管理行程/.apple-sync-state.json` 或 `管理行程/.apple-sync-notes-state.json`，它們是腳本自己維護的狀態檔。
