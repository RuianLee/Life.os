---
name: notes-sync
description: 把 每日整理/<date>/tasks.json 整理成一則 Notes.app 備忘錄（iCloud「Life.os」資料夾），方便只帶平板時也能查看當天待辦。同一天只建立一次筆記，之後不覆寫，避免蓋掉手動勾選的進度。
---

執行備忘錄同步。

## 步驟

1. 找出今天的 `每日整理/<today>/tasks.json`（`today` 用 `date +%F`）。如果不存在，先提醒使用者今天還沒跑過 `/daily-check`。
2. 執行：
   ```bash
   node .claude/skills/notes-sync/scripts/sync_notes.js "每日整理/<today>/tasks.json" "<today>"
   ```
3. 這個腳本的邏輯是固定的：
   - 如果 iCloud 帳號下 `Life.os` 資料夾裡已經有當天日期的筆記（用 `行程/.notes-sync-state.json` 記錄的 id 檢查），就完全不覆寫，只回報「已存在」。
   - 沒有的話才建立一則新筆記，標題是「`<date> 待辦`」，內容是依時間排序的條列文字（每個待辦一行）。
4. 回報腳本印出的結果（新建或略過），並提醒使用者：**Notes.app 沒有辦法透過程式建立真正可勾選的 checklist**（AppleScript 沒有官方支援，實測 HTML 技巧會被 Notes 正規化成一般條列，勾選狀態不會保留）。如果使用者想要能打勾的清單，可以在 iPad/Mac 的備忘錄裡全選這些條列文字，點工具列的「打勾清單」格式化按鈕，就會變成真正的 checklist——因為腳本之後不會再覆寫同一天的筆記，使用者手動轉換後的勾選進度是安全的。

## 注意事項

- 不要手動修改 `行程/.notes-sync-state.json`，它是腳本自己維護的狀態檔。
- 如果使用者想要「真正一開始就能打勾」的體驗，提醒他們 Reminders.app（`/ios-sync` 已經在同步）本來就是可勾選的清單，Notes 這邊比較適合當作「當天完整資訊的可讀筆記」，不是取代 Reminders。
