---
name: sub-caldav-sync
description: 把 sub-daily-check 產出的 02-zettelkasten/03-Calendar/<date>/tasks.json 裡「有明確時間」的任務，透過 CalDAV 直連寫進 iCloud 的 Calendar（不需要本機 Mac、不用 osascript）。用 schedule/.caldav-sync-state.json 做去重，重跑不會建立重複事件。刻意不處理 Reminders 跟 Notes（都是實測過的 iCloud 限制，見腳本檔頭註解），這兩項留給本機的 sub-apple-sync 處理。
---

執行雲端版 Calendar 同步。

## 步驟

1. 找出對應的 `02-zettelkasten/03-Calendar/<date>/tasks.json`（`date` 由呼叫端決定，通常是 `date +%F`）。如果不存在，提醒使用者先跑過 `sub-daily-check` 產生它。
2. 執行：
   ```bash
   node .claude/skills/sub-caldav-sync/scripts/sync_caldav.js "02-zettelkasten/03-Calendar/<date>/tasks.json"
   ```
   需要環境變數 `APPLE_ID_EMAIL`、`APPLE_APP_SPECIFIC_PASSWORD`（iCloud 帳號信箱與「App 專用密碼」，在 appleid.apple.com > 登入與安全性 > App 專用密碼 產生，不是登入密碼）。手動測試時使用者要自己在終端機 export 這兩個變數；在 GitHub Actions 裡則是從 Secrets 帶入。
3. 腳本邏輯（不需要你自己判斷要不要重複建立）：
   - 只處理 `tasks.json` 裡 `type === "event"` 的任務（有明確時間的），寫進 iCloud 帳號底下一個叫「daily」的行事曆。這個行事曆**必須事先手動建立好**（Calendar.app > File > New Calendar，帳號選 iCloud，命名為 daily）——Calendar.app 的 AppleScript 沒有「account」概念沒辦法自動建、CalDAV 的 MKCALENDAR 建出來的行事曆也有「協定接受但 App 不認得」的風險，所以這裡選擇不自動建立，找不到就直接報錯，請使用者去手動建。
   - 每個任務用 `contentHash` 比對 `schedule/.caldav-sync-state.json` 裡的紀錄：沒看過就新建、內容沒變就略過、內容變了就用存好的 CalDAV 物件 URL/ETag 直接更新既有事件。
   - 任務如果從 tasks.json 消失（日期過了、來源檔案被搬到 trash-can），會自動刪除對應的 CalDAV 事件。
   - `Reminders` 型任務（`type === "reminder"`）完全跳過不處理，因為這個帳號真正在用的 Reminders 清單透過 CalDAV 完全存取不到（實測對 calendar-home-set 做原始 PROPFIND，找不到任何一個使用者真正在用的清單，唯一找得到的 VTODO collection 叫「提醒事項 ⚠️」——這個警告符號是 Apple 伺服器自己回的名稱，幾乎可以確定是官方標記的舊版相容殘留物，寫進去 iCloud 會接受但 Reminders.app 完全不會顯示）。這是 Apple 這幾年把 Reminders 換成私有同步協定的已知限制，不是這支腳本能力不足。
   - `Notes` 完全不處理，Apple Notes 沒有公開的 CalDAV/API，只能靠本機 osascript。
   - 每筆事件固定帶一個 30 分鐘前的 `VALARM`（`TRIGGER:-PT30M`）。因為 `contentHash` 沒有把這個算進去，**已經同步過、內容沒變的舊事件不會自動補上提醒**——只有新建的事件或內容有變動而觸發更新的事件才會帶這個提醒；要讓所有既有事件都補上，需要清掉對應的 state 檔（`--clear`）讓它們全部視為新建重跑一次。
4. 把腳本印出的統計（新增/更新/略過/清除各幾筆）用一兩句話回報，不用重新複述每一筆任務內容。並提醒使用者：Reminders 跟 Notes 沒有被這條路徑處理，仍然只能靠手動跑 `/core-daily-sync`（本機、含 sub-apple-sync）才會同步。

## 注意事項

- 這條路徑跟本機的 `sub-apple-sync` 都會寫進同一個 iCloud「daily」行事曆，為了不重複建立事件，`sub-apple-sync/scripts/sync.js` 在判斷「要不要新建」之前，也會檢查 `schedule/.caldav-sync-state.json` 裡有沒有這個 task id（有的話視為已同步、略過）。這個交互檢查邏輯寫在 `sync.js` 裡，這支 skill 本身不用做任何事。
- 不要手動修改 `schedule/.caldav-sync-state.json`，它是腳本自己維護的狀態檔，且需要 commit 進 git（GitHub Actions 的 runner 每次都是全新環境，不 commit 回去下次就會失憶、重複建立事件）。
