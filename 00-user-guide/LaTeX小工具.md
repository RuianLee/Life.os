# LaTeX 小工具

涵蓋兩個跟 LaTeX 教材製作有關、但互相獨立的 skill。

## `core-init-latex`：建立語法速查範例檔

- 用途：建立一份可以直接 `xelatex` 編譯的 `.tex`，裡面收錄常用格式的寫法（標題、清單、粗斜體、引用、表格、註腳……），編譯出來是一份「每種格式長什麼樣」的對照 PDF，之後想用某個格式時直接來這裡複製語法，不用每次上網查。
- 怎麼用：輸入 `/core-init-latex`，會問你要建在哪個資料夾、檔名叫什麼（預設建議 `LaTeX格式範例.tex`）。
- 前導碼（`\documentclass`、字型設定等）會抓專案裡既有、已知能編譯成功的 `.tex`（例如 [01-main-project/church-life/聖經陪讀/製作自己的聖經陪讀教材/](../01-main-project/church-life/聖經陪讀/製作自己的聖經陪讀教材/) 底下的檔案）當基礎，跟其他教材用同一套設定，不會另外發明沒驗證過的寫法。

## `core-latex-tidy`：編譯完收拾資料夾

- 用途：xelatex 編譯完 `.tex` 之後，把這篇文件所有相關檔案（`.pdf`/`.aux`/`.log`/`.synctex.gz`/`.toc`/`.out`/`.fls`/`.fdb_latexmk`）收進一個以 `.tex` 檔名命名的專屬子資料夾，讓外層資料夾乾淨、之後重新編譯的中間檔也只留在自己的資料夾裡。
- 怎麼用：優先用你目前在 IDE 聚焦的 `.tex` 檔案，輸入 `/core-latex-tidy` 即可；如果目標資料夾第一層只有一個 `.tex`，不用特別指定。
- **要先編譯到穩定狀態再跑**：如果文件有目錄／交叉引用，通常要編譯兩次以上直到不再跳出 rerun 提示。不要在多次編譯之間穿插執行這個 skill，否則下一次編譯會找不到上一輪的 `.aux`。
- 只搬檔案、建資料夾，不改任何檔案內容。

## 建議流程

1. 沒有範例可查時，先跑一次 `/core-init-latex` 建一份速查表。
2. 寫教材、`xelatex` 編譯到穩定。
3. 跑 `/core-latex-tidy` 把這篇教材收進專屬資料夾。

## 相關檔案位置

- skill 定義：`.claude/skills/core-init-latex/`、`.claude/skills/core-latex-tidy/`
- 現有教材參考：[01-main-project/church-life/聖經陪讀/製作自己的聖經陪讀教材/](../01-main-project/church-life/聖經陪讀/製作自己的聖經陪讀教材/)

## 注意事項

- `.aux`/`.log`/`.synctex.gz` 已經被根目錄 `.gitignore` 排除；`.toc`/`.out`/`.fls`/`.fdb_latexmk` 目前沒有涵蓋，`core-latex-tidy` 執行後如果搬進去的檔案有這幾種副檔名，它會提醒你要不要也加進 `.gitignore`。
- 如果因為整理資料夾而新增/搬移了結構，記得可以用 `/core-structure-sync` 確認要不要同步更新 README.md / CLAUDE.md（見 [00-user-guide/資料夾結構同步.md](資料夾結構同步.md)）。
