# Daily Sync（每日行程同步）

一組 Claude Code skill，把 `管理行程/` 資料夾（截圖、課表、公告等雜亂的原始行程資料）整理成每日待辦，並同步到本機的 Calendar.app / Reminders.app / Notes.app（都經 iCloud 同步到 iPhone/iPad）。目前是純手動觸發（`/core-daily-sync`），沒有排程。使用說明見 `使用手冊/訂定每日行程.md`；這份文件記錄的是「怎麼做出來的」與過程中踩到的坑。

## 架構

```
.claude/
  settings.json                          # 專案層級權限白名單（見下方「權限設計」）
  skills/
    sub-daily-check/SKILL.md             # LLM 判斷：掃描 管理行程/，產出 每日重點整理/、搬移過期檔案
    sub-apple-sync/
      SKILL.md                           # 薄包裝，指示執行下面兩支腳本
      scripts/sync.js                    # 決定性程式：Calendar/Reminders 的建立/更新/刪除 + dedup
      scripts/sync_notes.js              # 決定性程式：Notes 筆記建立（不覆寫）
    core-daily-sync/SKILL.md              # 依序執行上面兩個 skill 的入口
管理行程/
  schedule-log.md                        # sub-daily-check 每次執行的留痕（追加，不覆寫）
  .apple-sync-state.json                 # task id -> Calendar/Reminders 的 Apple id（不進 git）
  .apple-sync-notes-state.json           # date -> Notes 筆記 id（不進 git）
每日重點整理/
  <YYYY-MM-DD>/
    <YYYY-MM-DD>.md                      # 人看的整理
    tasks.json                           # 給 sync.js / sync_notes.js 消費的結構化資料
```

## 為什麼分成「LLM 判斷」跟「決定性程式」兩層

`sub-daily-check` 需要「看懂」截圖裡的課表、判斷某個檔案是不是真的過期、是一次性事件還是可重複使用的範本——這些是語意判斷，只能靠 LLM（Claude 本身）做，不能寫死規則。

但「這個任務有沒有同步過、要不要建立新的 Calendar 事件」是純粹的資料比對問題，不需要語意判斷，寫成固定程式碼（`sync.js` / `sync_notes.js`）反而更可靠——不會因為 LLM 每次執行的措辭/判斷有微小差異就跑出不一樣的行為。所以架構上刻意切成兩層：sub-daily-check 產出結構化的 `tasks.json` 當「資料契約」，後面兩個同步腳本純粹是消費這份資料的決定性程式，不依賴 LLM 重新判斷一次。

## 資料契約：`tasks.json`

```json
{
  "id": "sha1(source_file + date + title) 前 12 碼",
  "title": "16:00 後至三會所到寢室",
  "date": "2026-07-05",
  "time": "16:00 或 null",
  "type": "event 或 reminder",
  "source_file": "相對於 repo 根目錄的來源檔案路徑",
  "notes": "補充說明"
}
```

`type` 決定路由：有明確時間 → Calendar 事件；只有日期、屬於待辦性質 → Reminders 提醒事項。這對應 iOS 上兩個 App 本來的使用習慣（Calendar 是時間區塊、Reminders 是可勾選清單）。

**`id` 的計算刻意不包含「執行當天的日期」**，只用「任務本身的 date + title + source_file」算 sha1。這是整個 dedup 機制的基礎：同一件事不管是哪一天被 daily-check 重新產生（例如今天整理出「7/12 賦歸返家」，明天再跑一次也會整理出同一筆），id 都要一樣，同步腳本才能認出「這是同一個任務」而不是重複建立。

**已知限制**：id 同時把 `title` 文字算進去，代表如果 sub-daily-check 兩次生成的標題措辭不完全一樣（LLM 每次重新整理的用詞可能有微小差異），會被當成不同任務——舊的在下次同步時被清掉、新的被建立，而不是「原地更新」。實務上同一天內容通常穩定，這個限制目前接受，沒有特別處理（例如做文字相似度比對）。

## sync.js 的 dedup 邏輯

`管理行程/.apple-sync-state.json` 記錄 `task id -> {contentHash, type, appleId, updatedAt}`。`sync.js` 每次執行對每個 task：

- state 沒有這個 id → 建立新的 Calendar 事件/Reminder，把 AppleScript 回傳的 `id` 存起來
- state 有、`contentHash`（title+date+time+notes 的 sha1）相同 → 略過，什麼都不做
- state 有、`contentHash` 不同 → 用存好的 `appleId` 找到既有事件/提醒，直接原地更新，不新建
- state 裡有、但這次 `tasks.json` 已經沒有的 id（日期過了，或來源檔案被 sub-daily-check 搬進 `垃圾桶/`）→ 反向清理：Calendar 事件直接刪除，Reminder 標記完成（不刪除，留著當歷史紀錄）

`sync_notes.js` 的邏輯簡單很多，因為 Notes 是「一天一則筆記」而不是「一個任務一個項目」：`管理行程/.apple-sync-notes-state.json` 只記 `date -> noteId`。如果當天的筆記已存在就完全不碰（見下方「為什麼 Notes 不能做真 checklist」），只有第一次才建立。

## 開發過程中踩到的三個 AppleScript 坑

這幾個是實際測試（建立、改時間、重跑、刪除）才發現的，不是看文件能事先知道的：

1. **Calendar 改時間的方向性 bug**：更新既有事件時，如果新的開始時間跨過了「舊的結束時間」（例如把 16:00 的事件改到 17:30，但舊的結束時間還是 17:00），Calendar 會直接拒絕（「開始日期必須早於結束日期」），因為 AppleScript 對 `start date` / `end date`是依序寫入的兩個獨立屬性，不是原子操作——就算包在同一個 `set properties of theEvent to {...}` 裡也一樣會依序套用。而且不管先寫哪一個欄位，只要新舊時間互相跨越就會炸，不分往前調或往後調。
   **解法**：先把 `end date` 設成一個很遠的未來值（`newStartDate + 3650 天`）當安全暫存值，這樣不管接下來按什麼順序寫入真正的 start/end，都不會跟目前的值衝突。往前調、往後調都測過沒問題。

2. **Reminders 建立清單需要指定帳號**：`tell application "Reminders" to make new list ...`（不指定帳號）會直接噴 `-1728 無法取得部分物件`，必須 `tell account "iCloud"` 才建得起來。第一次手動測試時「剛好」成功過（懷疑是當下 Reminders 內部狀態的巧合），直到 Reminders 的「Life.os」清單被外部整個刪掉、重新觸發建立邏輯時才真正暴露這個 bug。

3. **Notes 建立資料夾也需要指定帳號**，跟第 2 點是同一種坑：`tell application "Notes" to make new folder ...` 不指定帳號一樣會失敗，要 `tell account "iCloud"`。

這三點的共通教訓：Calendar / Reminders / Notes 這三個 App 的 AppleScript 字典，「建立」類的操作（新行事曆、新清單、新資料夾）幾乎都需要明確的帳號或容器上下文，不能只對 `application` 層級呼叫；純粹的讀取/查詢通常不需要。

## 為什麼 Notes 不能做真的 checklist

一開始的設計是想讓 Notes 筆記本身就是可勾選的 checklist（這樣使用者不用開 Reminders）。查過 Notes.app 的 `sdef`（AppleScript 字典），完全沒有 checklist 相關的類別或屬性。網路上流傳一個技巧——把 `body` 設成 `<ul class="checklist"><li class="checked">...</li></ul>` 這種 HTML，據說 Notes 會認得——實測直接把它讀回來看：

```
輸入：<ul class="checklist"><li class="checked">項目二</li></ul>
讀回：<ul><li>項目二</li></ul>
```

`class` 屬性整個被丟掉，變成普通條列，checked 狀態沒有保留。確認這條路走不通後，改成務實的做法：純文字條列（一行一個待辦），且**同一天只建立一次、之後不覆寫**——這樣使用者如果自己在裝置上手動全選、用備忘錄工具列的「打勾清單」格式化成真正的 checklist，之後重跑同步也不會把它蓋掉。真正「一開始就能打勾」的需求，交給本來就支援的 Reminders.app。

## 權限設計

`.claude/settings.json` 的 `permissions.allow` 刻意收斂到只允許這幾個 skill 實際會用到的範圍，而不是整個專案的 `Write(**)`：

```json
{
  "permissions": {
    "allow": [
      "Read(**)",
      "Write(每日重點整理/**)", "Write(管理行程/**)", "Write(垃圾桶/**)",
      "Edit(管理行程/**)",
      "Bash(mv:*)", "Bash(mkdir:*)", "Bash(date:*)", "Bash(shasum:*)",
      "Bash(node .claude/skills/sub-apple-sync/scripts/sync.js:*)",
      "Bash(node .claude/skills/sub-apple-sync/scripts/sync_notes.js:*)"
    ]
  }
}
```

原因：這個允許清單不只影響「排程自動跑」，也會影響你平常互動使用 Claude Code 時的權限詢問行為。把 `Write`/`Edit` 限制在 `每日重點整理/`、`管理行程/`、`垃圾桶/` 底下，而不是整個 repo，是為了不要因為做這個功能就順帶讓其他資料夾（例如 `召會生活/`、`知識主題/`）的寫入變成「永遠不問就允許」。

值得注意：Claude 自己的 Bash 呼叫只有 `node .../sync.js` 這一條，內部的 `osascript` 呼叫是 `sync.js` 這個 Node 程式自己用 `child_process.execFileSync` 開的子程序，不是 Claude 的 Bash 工具直接呼叫，所以不需要（也沒有）額外把 `Bash(osascript:*)` 放進允許清單——這樣可以避免開放一個可以執行任意 AppleScript 的寬鬆權限。

## 排程自動化：做過，後來拿掉了

最早的版本有做 macOS `launchd` 排程，每天早上自動跑三個 skill。技術上是可行的，但發現一個 macOS 安全機制擋住了它：**launchd 啟動的裸 `/bin/zsh` 進程讀不到 `~/Desktop` 底下的檔案**（TCC 隱私保護，噴 `Operation not permitted`），因為 Desktop 是受保護資料夾，而 launchd 直接執行的系統 shell 從沒被單獨授權過——這跟在互動式終端機手動執行是兩種不同的權限身份。要解的話需要使用者手動去「系統設定 > 隱私權與安全性 > 完整磁碟取用權限」加入 `/bin/zsh`，這是 Apple 刻意不開放程式化授權的安全邊界，沒辦法用腳本繞過。

後來使用者決定改成純手動觸發，所以拿掉了 `~/Library/LaunchAgents/com.brianlee.lifeos.dailycheck.plist` 跟對應的 runner script。核心的三個 skill／同步腳本邏輯完全沒變，如果之後想重新加回排程，把這幾個檔案裝回去、使用者手動做一次那個系統設定授權即可，不需要重新設計。

## 已知限制總結

- Notes 不支援真正可勾選的 checklist（見上）。
- dedup 用「標題文字」當 id 的一部分，措辭微調會被當成不同任務（見「資料契約」）。
- 目前純手動觸發，沒有背景排程。
- Calendar/Reminders/Notes 都用固定的容器名稱（Calendar 行事曆叫「daily」，Reminders 清單／Notes 資料夾都叫「daily-sync」），沒有做「多帳號/多裝置」的彈性——這是個人單機工具，夠用就好。
