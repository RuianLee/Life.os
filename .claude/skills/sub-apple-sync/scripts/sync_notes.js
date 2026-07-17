#!/usr/bin/env node
'use strict';

/**
 * 把 每日重點整理/<date>/tasks.json 整理成一則 Notes.app 筆記（iCloud 帳號、"daily-sync" 資料夾），
 * 方便只帶平板時也能打開備忘錄看今天/這週待辦。
 *
 * 重要限制：Notes.app 沒有可透過 AppleScript/JXA 建立「真正可勾選 checklist」的官方支援
 * （查過 Notes.app 的 sdef，沒有 checklist 相關類別/屬性；實測 <ul class="checklist"> 這類
 * HTML 技巧會被 Notes 正規化成一般條列文字，checked 狀態不會保留）。因此做法是：
 *  - 每個日期只在第一次同步時建立筆記（純文字條列，一行一個待辦）
 *  - 如果當天的筆記已經存在，預設不覆寫，只回報「已存在」——避免不小心蓋掉使用者手動轉成
 *    checklist 後的勾選進度（使用者可以在 iPad/Mac 上全選條列文字，用備忘錄工具列的「打勾清單」
 *    格式化成真正可勾選的清單）
 *  - 呼叫端（Claude）看到「已存在」的回報後，必須先詢問使用者是否要覆蓋，使用者確認後才加
 *    `--force` 重新執行；此腳本本身不會自動覆蓋
 *
 * Usage: node sync_notes.js <path-to-tasks.json> <YYYY-MM-DD> [--force]
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const STATE_PATH = path.join(REPO_ROOT, 'schedule', '.apple-sync-notes-state.json');
const ACCOUNT_NAME = 'iCloud';
const FOLDER_NAME = 'daily-sync';

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

function overwriteNote(noteId, dateStr, tasks) {
  const body = buildBody(dateStr, tasks);
  const script = `
tell application "Notes"
  set targetNote to note id "${escapeAS(noteId)}"
  set body of targetNote to "${escapeAS(body)}"
end tell
`;
  runAppleScript(script);
}

function main() {
  const tasksArg = process.argv[2];
  const dateArg = process.argv[3];
  const force = process.argv.includes('--force');
  if (!tasksArg || !dateArg) {
    console.error('Usage: node sync_notes.js <path-to-tasks.json> <YYYY-MM-DD> [--force]');
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
    if (!force) {
      console.log(`notes-sync：${dateArg} 的筆記已存在，未覆寫（如需覆蓋請先向使用者確認，再加 --force 重跑）。`);
      return;
    }
    overwriteNote(existing.noteId, dateArg, tasks);
    state[dateArg] = { noteId: existing.noteId, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
    writeJSON(STATE_PATH, state);
    console.log(`notes-sync：已覆蓋 ${dateArg} 的備忘錄筆記（${tasks.length} 項待辦）。`);
    return;
  }

  const noteId = createNote(dateArg, tasks);
  state[dateArg] = { noteId, createdAt: new Date().toISOString() };
  writeJSON(STATE_PATH, state);
  console.log(`notes-sync：已為 ${dateArg} 建立新的備忘錄筆記（${tasks.length} 項待辦）。`);
}

main();
