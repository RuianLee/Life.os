# 02-吳莉雯

姊妹專屬的行程表上傳收件匣，由她手機上的 iOS 捷徑透過 GitHub API 直接把截圖/PDF 丟進這個資料夾。

新檔案進來會觸發 `.github/workflows/guest-schedule-sync.yml`，執行 `/core-guest-schedule-sync` 萃取成 `events-latest.json`，再透過 CalDAV 寫進她自己的 iCloud 行事曆。已處理過的原始檔會被歸檔進 `原始檔/`（不存在會自動建立），不會重複讀取。

這條線跟 brianlee 自己的 `03-schedule/` 分類資料夾、`00-計劃總覽.md`、Notion 同步、trash-can 完全隔離，互不影響。細節見 plan：`C:\Users\User\.claude\plans\1-iphone-cozy-moler.md`。
