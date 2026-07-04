#!/usr/bin/env node
'use strict';

/**
 * 把 每日整理/<date>/tasks.json 整理成一則 Notes.app 筆記（iCloud 帳號、"Life.os" 資料夾），
 * 方便只帶平板時也能打開備忘錄看今天/這週待辦。
 *
 * 重要限制：Notes.app 沒有可透過 AppleScript/JXA 建立「真正可勾選 checklist」的官方支援
 * （查過 Notes.app 的 sdef，沒有 checklist 相關類別/屬性；實測 <ul class="checklist"> 這類
 * HTML 技巧會被 Notes 正規化成一般條列文字，checked 狀態不會保留）。因此做法是：
 *  - 每個日期只在第一次同步時建立筆記（純文字條列，一行一個待辦）
 *  - 如果當天的筆記已經存在，完全不覆寫——避免蓋掉使用者手動轉成 checklist 後的勾選進度
 *    （使用者可以在 iPad/Mac 上全選條列文字，用備忘錄工具列的「打勾清單」格式化成真正可勾選的清單）
 *
 * Usage: node sync_notes.js <path-to-tasks.json> <YYYY-MM-DD>
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const STATE_PATH = path.join(REPO_ROOT, '行程', '.notes-sync-state.json');
const ACCOUNT_NAME = 'iCloud';
const FOLDER_NAME = 'Life.os';

function readJSON(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJSON(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function sanitize(str) {
  return String(str || '').replace(/\r?\n/g, ' ').trim();
}

function escapeHTML(str) {
  return sanitize(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAS(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function runAppleScript(script) {
  return execFileSync('osascript', ['-e', script], { encoding: 'utf8' }).trim();
}

function ensureFolderExists() {
  runAppleScript(`
tell application "Notes"
  tell account "${ACCOUNT_NAME}"
    if not (exists folder "${FOLDER_NAME}") then
      make new folder with properties {name:"${FOLDER_NAME}"}
    end if
  end tell
end tell
`);
}

function noteExists(noteId) {
  const script = `
tell application "Notes"
  return (exists note id "${escapeAS(noteId)}") as string
end tell
`;
  try {
    return runAppleScript(script) === 'true';
  } catch (e) {
    return false;
  }
}

function buildBody(dateStr, tasks) {
  const title = `${dateStr} 待辦`;
  const lines = [`<div>${escapeHTML(title)}</div>`];
  const sorted = [...tasks].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const at = a.time || '99:99';
    const bt = b.time || '99:99';
    return at < bt ? -1 : at > bt ? 1 : 0;
  });
  for (const t of sorted) {
    const timePart = t.time ? `${t.date} ${t.time}　` : `${t.date}　`;
    lines.push(`<div>${escapeHTML(timePart + t.title)}</div>`);
  }
  return lines.join('\n');
}

function createNote(dateStr, tasks) {
  const body = buildBody(dateStr, tasks);
  const script = `
tell application "Notes"
  tell account "${ACCOUNT_NAME}"
    tell folder "${FOLDER_NAME}"
      set newNote to make new note with properties {body:"${escapeAS(body)}"}
      return id of newNote
    end tell
  end tell
end tell
`;
  return runAppleScript(script);
}

function main() {
  const tasksArg = process.argv[2];
  const dateArg = process.argv[3];
  if (!tasksArg || !dateArg) {
    console.error('Usage: node sync_notes.js <path-to-tasks.json> <YYYY-MM-DD>');
    process.exit(1);
  }
  const tasks = readJSON(path.resolve(tasksArg), null);
  if (!tasks) {
    console.error(`找不到 tasks.json: ${tasksArg}`);
    process.exit(1);
  }

  ensureFolderExists();

  const state = readJSON(STATE_PATH, {});
  const existing = state[dateArg];

  if (existing && noteExists(existing.noteId)) {
    console.log(`notes-sync：${dateArg} 的筆記已存在，保留現有內容與勾選進度，未覆寫。`);
    return;
  }

  const noteId = createNote(dateArg, tasks);
  state[dateArg] = { noteId, createdAt: new Date().toISOString() };
  writeJSON(STATE_PATH, state);
  console.log(`notes-sync：已為 ${dateArg} 建立新的備忘錄筆記（${tasks.length} 項待辦）。`);
}

main();
