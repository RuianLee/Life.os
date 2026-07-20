---
title: Zod 對於 markdown 是甚麼
date: 2026-07-20
type: 靈感筆記
tags: [靈感筆記]
notion_url: https://www.notion.so/3a36830c2de781718c14fd573b953f25
---

## Zod
- 在 Markdown 生態系中，它主要被用來驗證 Markdown 檔案頂部的結構化資料（Frontmatter）。
  - 開發者能確保 Markdown 筆記或內容集合的資料格式正確無誤。

## 什麼是 Frontmatter？
- Markdown 檔案（.md）開頭經常會使用 --- 包起來的區塊，用來記錄文章的屬性（例如：標題、作者、日期、標籤）。
- ![alt text](image.png)

##  Zod 的作用：內容綱要 (Schema) 驗證
- Frontmatter 是純文字，若欄位填錯（例如把日期 date 寫成字串，或遺漏了必填的 title），程式執行時容易出錯
- 使用 Zod 即可定義嚴格的規則：定義規則：規定 title 必須是字串，date 必須是合法的時間格式，tags 必須是陣列。
- 自動報錯：若 Markdown 的 Frontmatter 不符合 Zod 的定義，程式會直接拋出錯誤，確保內容品質。