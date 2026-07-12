#!/usr/bin/env node
'use strict';

/**
 * 讀取 daily-check 產出的 tasks.json，把任務同步到本機的 Calendar.app / Reminders.app
 * （會經 iCloud 自動同步到 iPhone）。用 行程/.apple-sync-state.json 記錄
 * 「task id -> Apple 端 id」的對應，重跑時比對 contentHash 決定新增/更新/略過，
 * 避免每次執行都重複建立事件。
 *
 * Usage: node sync.js <path-to-tasks.json>
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const STATE_PATH = path.join(REPO_ROOT, '行程', '.apple-sync-state.json');
const CALENDAR_NAME = 'Life.os';
const REMINDER_LIST_NAME = 'Life.os';
const REMINDER_ACCOUNT_NAME = 'iCloud';

function readJSON(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJSON(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function contentHash(task) {
  const raw = [task.title, task.date, task.time || '', task.notes || ''].join('|');
  return crypto.createHash('sha1').update(raw, 'utf8').digest('hex');
}

function sanitize(str) {
  return String(str || '').replace(/\r?\n/g, ' ').trim();
}

function escapeAS(str) {
  return sanitize(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function runAppleScript(script) {
  return execFileSync('osascript', ['-e', script], { encoding: 'utf8' }).trim();
}

function dateAssignLines(varName, dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const lines = [
    `set year of ${varName} to ${y}`,
    `set month of ${varName} to ${m}`,
    `set day of ${varName} to ${d}`,
  ];
  if (timeStr) {
    const [hh, mm] = timeStr.split(':').map(Number);
    lines.push(`set time of ${varName} to (${hh} * hours + ${mm} * minutes)`);
  } else {
    lines.push(`set time of ${varName} to 0`);
  }
  return lines.join('\n');
}

function ensureCalendarExists() {
  runAppleScript(`
tell application "Calendar"
  if not (exists calendar "${escapeAS(CALENDAR_NAME)}") then
    make new calendar with properties {name:"${escapeAS(CALENDAR_NAME)}"}
  end if
end tell
`);
}

function ensureReminderListExists() {
  // 跟 Notes.app 一樣的坑：直接對 application 層級 make new list 會噴
  // -1728「無法取得部分物件」，必須先 tell account 才能建立。
  runAppleScript(`
tell application "Reminders"
  if not (exists list "${escapeAS(REMINDER_LIST_NAME)}") then
    tell account "${escapeAS(REMINDER_ACCOUNT_NAME)}"
      make new list with properties {name:"${escapeAS(REMINDER_LIST_NAME)}"}
    end tell
  end if
end tell
`);
}

function createCalendarEvent(task) {
  const script = `
set startDate to current date
${dateAssignLines('startDate', task.date, task.time)}
set endDate to startDate + (1 * hours)
tell application "Calendar"
  tell calendar "${escapeAS(CALENDAR_NAME)}"
    set newEvent to make new event with properties {summary:"${escapeAS(task.title)}", start date:startDate, end date:endDate, description:"${escapeAS(task.notes)}"}
    save
    return id of newEvent
  end tell
end tell
`;
  return runAppleScript(script);
}

function updateCalendarEvent(appleId, task) {
  // 修改既有事件的起訖時間有方向性風險：不管先設 start 還是先設 end，
  // 只要新舊時間跨越了對方目前的值，中途就會出現「start >= end」的暫時無效狀態
  // 而被 Calendar 拒絕。作法：先把 end date 推到很遠的未來當安全暫存值，
  // 這樣接下來不管新 start/end 是往前還是往後移，都不會跟目前的值衝突。
  const script = `
set startDate to current date
${dateAssignLines('startDate', task.date, task.time)}
set endDate to startDate + (1 * hours)
set farFutureDate to startDate + (3650 * days)
tell application "Calendar"
  tell calendar "${escapeAS(CALENDAR_NAME)}"
    set theEvent to (first event whose id is "${escapeAS(appleId)}")
    set end date of theEvent to farFutureDate
    set start date of theEvent to startDate
    set end date of theEvent to endDate
    set summary of theEvent to "${escapeAS(task.title)}"
    set description of theEvent to "${escapeAS(task.notes)}"
    save
  end tell
end tell
`;
  try {
    runAppleScript(script);
    return true;
  } catch (e) {
    return false;
  }
}

function deleteCalendarEvent(appleId) {
  const script = `
tell application "Calendar"
  tell calendar "${escapeAS(CALENDAR_NAME)}"
    delete (first event whose id is "${escapeAS(appleId)}")
    save
  end tell
end tell
`;
  try {
    runAppleScript(script);
    return true;
  } catch (e) {
    return false;
  }
}

function createReminder(task) {
  const script = `
set dueDate to current date
${dateAssignLines('dueDate', task.date, task.time)}
tell application "Reminders"
  tell list "${escapeAS(REMINDER_LIST_NAME)}"
    set newReminder to make new reminder with properties {name:"${escapeAS(task.title)}", due date:dueDate, body:"${escapeAS(task.notes)}"}
    return id of newReminder
  end tell
end tell
`;
  return runAppleScript(script);
}

function updateReminder(appleId, task) {
  const script = `
set dueDate to current date
${dateAssignLines('dueDate', task.date, task.time)}
tell application "Reminders"
  tell list "${escapeAS(REMINDER_LIST_NAME)}"
    set theReminder to (first reminder whose id is "${escapeAS(appleId)}")
    set properties of theReminder to {name:"${escapeAS(task.title)}", due date:dueDate, body:"${escapeAS(task.notes)}"}
  end tell
end tell
`;
  try {
    runAppleScript(script);
    return true;
  } catch (e) {
    return false;
  }
}

function completeReminder(appleId) {
  const script = `
tell application "Reminders"
  tell list "${escapeAS(REMINDER_LIST_NAME)}"
    set completed of (first reminder whose id is "${escapeAS(appleId)}") to true
  end tell
end tell
`;
  try {
    runAppleScript(script);
    return true;
  } catch (e) {
    return false;
  }
}

function main() {
  const tasksArg = process.argv[2];
  if (!tasksArg) {
    console.error('Usage: node sync.js <path-to-tasks.json>');
    process.exit(1);
  }
  const tasksPath = path.resolve(tasksArg);
  const tasks = readJSON(tasksPath, null);
  if (!tasks) {
    console.error(`找不到 tasks.json: ${tasksPath}`);
    process.exit(1);
  }

  ensureCalendarExists();
  ensureReminderListExists();

  const state = readJSON(STATE_PATH, {});
  const seenIds = new Set();

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let removed = 0;

  for (const task of tasks) {
    seenIds.add(task.id);
    const hash = contentHash(task);
    const existing = state[task.id];

    if (!existing) {
      const appleId = task.type === 'event' ? createCalendarEvent(task) : createReminder(task);
      state[task.id] = { contentHash: hash, type: task.type, appleId, updatedAt: new Date().toISOString() };
      created++;
      continue;
    }

    if (existing.contentHash === hash) {
      skipped++;
      continue;
    }

    const ok = existing.type === 'event'
      ? updateCalendarEvent(existing.appleId, task)
      : updateReminder(existing.appleId, task);

    if (ok) {
      state[task.id] = { contentHash: hash, type: task.type, appleId: existing.appleId, updatedAt: new Date().toISOString() };
      updated++;
    } else {
      // 找不到既有事件（可能被手動刪除）-> 視為新建
      const appleId = task.type === 'event' ? createCalendarEvent(task) : createReminder(task);
      state[task.id] = { contentHash: hash, type: task.type, appleId, updatedAt: new Date().toISOString() };
      created++;
    }
  }

  // 反向清理：state 裡有、但這次 tasks.json 已經沒有的項目（日期已過或來源已被搬到 垃圾桶）
  for (const id of Object.keys(state)) {
    if (seenIds.has(id)) continue;
    const entry = state[id];
    if (entry.type === 'event') {
      deleteCalendarEvent(entry.appleId);
    } else {
      completeReminder(entry.appleId);
    }
    delete state[id];
    removed++;
  }

  writeJSON(STATE_PATH, state);

  console.log(`ios-sync 完成：新增 ${created} 筆、更新 ${updated} 筆、略過 ${skipped} 筆（未變動）、清除 ${removed} 筆。`);
}

main();
