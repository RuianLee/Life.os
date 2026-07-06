# 每日行程同步 SOP
```
/daily-sync
```

### 會做哪些事情：
到`行程/` 整理每日待辦，並同步所有 App，並藉著蘋果生態系（ 同步到 iPhone/iPad）。


1. **`/daily-check`**：掃描 `行程/` 底下所有檔案（含截圖/圖片），整理出「今天／明天／未來 7 天」的待辦
2. **`/apple-sync`**：一次同步到 Calendar 、Reminders、Notes

### 執行後要檢查什麼

- **Calendar.app**：打開行事曆確認事件是否都在
- **Reminders.app**：打開待辦事項
- **Notes.app**：打開備忘錄
- **`行程/schedule-log.md`**：如果 `/daily-check` 有搬移過期檔案，這裡會留紀錄（搬去 `垃圾桶/` 的原因）。建議偶爾翻一下，確認沒有搬錯東西。

### 注意事項
1. 目前是純手動模式，沒有排程
2. **`/daily-check`**：掃描 `行程/` 底下所有檔案，整理出「今天／明天／未來 7 天」的待辦，會處理以下檔案：
   - `每日整理/<今天日期>/<今天日期>.md`
   - `每日整理/<今天日期>/tasks.json`
   - 有沒有已經過期、沒參考價值的檔案，保守地搬到根目錄 `垃圾桶/`，並把判斷結果寫進 `行程/schedule-log.md`


## 單獨處理
如果只想跑其中一步，也可以單獨輸入 `/daily-check`、`/apple-sync`。

## 相關檔案位置

- skill 定義：`.claude/skills/daily-check/`、`.claude/skills/apple-sync/`、`.claude/skills/daily-sync/`
- 執行紀錄：`行程/schedule-log.md`
- 每日產出：`每日整理/<日期>/`
- 技術實作細節：`小專案/每日同步技術文件/`
