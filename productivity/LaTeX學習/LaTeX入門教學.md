# LaTeX 入門教學（給完全沒寫過的人）

## 什麼是 LaTeX？

LaTeX 是一種「標記語言」，你寫的不是所見即所得的文字，而是**帶有格式指令的純文字**，最後編譯成 PDF。

類比：你寫 Word 是「畫」文件，你寫 LaTeX 是「描述」文件。

---

## 文件基本骨架

每份 LaTeX 文件都長這樣：

```latex
\documentclass[12pt, a4paper]{article}  % 文件類型與選項
\usepackage{fontspec}                    % 載入套件
\usepackage{xeCJK}                       % 中文支援
\setCJKmainfont{PingFang TC}             % 設定中文字型

\begin{document}   % 內容從這裡開始

你寫的內容

\end{document}     % 文件結束
```

**規則：**
- `\` 開頭的是「指令」
- `{花括號}` 裡是指令的參數
- `[方括號]` 裡是選項
- `%` 之後是註解，不會出現在 PDF

---

## 標題與章節

```latex
\section{第一章}          % 大章節（自動編號 1.）
\subsection{小節}         % 子節（自動編號 1.1）
\subsubsection{更小的節}  % 再小一層（自動編號 1.1.1）

\section*{不編號的章節}   % 加 * 就不會自動編號
```

---

## 條列清單

**無序清單（bullet points）：**
```latex
\begin{itemize}
  \item 第一點
  \item 第二點
  \item 第三點
\end{itemize}
```

**有序清單（1. 2. 3.）：**
```latex
\begin{enumerate}
  \item 第一點
  \item 第二點
\end{enumerate}
```

---

## 文字格式

```latex
\textbf{粗體文字}
\textit{斜體文字}
\underline{底線文字}
\textbf{\textit{粗斜體}}   % 可以組合
```

---

## 段落與空白

| 寫法 | 效果 |
|------|------|
| 空一行 | 新段落 |
| `\\` | 強制換行（不另起段落） |
| `\bigskip` | 段落間加大空白 |
| `\noindent` | 取消首行縮排 |

---

## 常用符號

LaTeX 裡有些符號有特殊意義，要用指令才能印出來：

| 想要的符號 | 寫法 |
|-----------|------|
| `%` | `\%` |
| `&` | `\&` |
| `$` | `\$` |
| `_` | `\_` |
| `—`（破折號） | `---` |
| `–`（連接號） | `--` |

---

## 頁面設定

```latex
\usepackage{geometry}
\geometry{
  margin=2.5cm,    % 四邊留白
  top=3cm,         % 也可以分開設定
  bottom=2cm
}
```

---

## 編譯流程（在 VSCode）

1. 打開 `.tex` 檔案
2. 按 `Cmd + Option + B` 開始編譯
3. 按 `Cmd + Option + V` 開啟 PDF 預覽
4. 有錯誤的話，按 `Cmd + Option + L` 看錯誤訊息

> **重要：** 中文文件必須用 **xelatex** 編譯，不能用 pdflatex。
> 本專案的 VSCode 已設定好預設使用 xelatex。

---

## 常見錯誤

**編譯後沒有中文 / 方塊字**
→ 確認有 `\usepackage{xeCJK}` 和 `\setCJKmainfont{PingFang TC}`，且用 xelatex 編譯。

**`! Undefined control sequence`**
→ 指令打錯字，或忘記載入對應的套件（`\usepackage{...}`）。

**`! Missing $ inserted`**
→ 某個符號（如 `_`）被誤判為數學模式，前面加 `\` 跳脫。

---

## 這份教材的結構參考

參考同目錄的 `約翰福音.tex`，每章用同樣的結構：

```latex
\section{第X章：章名}

\subsection*{經文範圍}
約翰福音 X:X--X

\subsection*{默想問題}
\begin{enumerate}
  \item 問題一
  \item 問題二
\end{enumerate}

\subsection*{生活應用}
本週行動...
```

格式定好一次，之後加新章只要複製貼上再填內容就好。
