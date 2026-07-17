#!/usr/bin/env node
'use strict';

/**
 * 讀取 sub-daily-check 產出的 tasks.json，把任務同步到本機的 Calendar.app / Reminders.app
 * （會經 iCloud 自動同步到 iPhone）。用 管理行程/.apple-sync-state.json 記錄
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
const STATE_PATH = path.join(REPO_ROOT, 'schedule', '.apple-sync-state.json');
// 雲端版 sub-caldav-sync 的狀態檔：兩條路徑都會寫進同一個 iCloud「daily」行事曆，
// 這裡拿來判斷「這個事件是不是雲端已經同步過了」，避免同一天雲端跑過一次、
// 使用者稍晚又手動跑一次本機版，導致 Calendar 出現重複事件。
const CALDAV_STATE_PATH = path.join(REPO_ROOT, 'schedule', '.caldav-sync-state.json');
const CALENDAR_NAME = 'daily';
const REMINDER_ACCOUNT_NAME = 'iCloud';

// Reminders 不再全部塞進單一「Life.os」清單，改成依任務自己的 date 開清單
// （例如「2026-07-16」），這樣 Reminders.app 裡每天的待辦自然分開，不會愈疊愈長。
function reminderListName(task) {
  return task.date;
}

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
  // Calendar.app 的 AppleScript 字典沒有「account」這個詞彙（跟 Reminders/Notes 不同），
  // 沒辦法用 `tell account "iCloud"` 限定新建的行事曆要落在哪個帳號——實測 `make new calendar`
  // 沒有指定帳號時，一律建在本機「我的Mac」而非 iCloud，事件根本不會同步到 iPhone。
  // 所以這裡不自動建立，只檢查存在與否；「daily」這個 iCloud 行事曆需要使用者手動建立一次
  // （Calendar.app > File > New Calendar > 選 iCloud 帳號 > 命名為 daily）。
  const exists = runAppleScript(`
tell application "Calendar"
  return (exists calendar "${escapeAS(CALENDAR_NAME)}")
end tell
`);
  if (exists.trim() !== 'true') {
    throw new Error(
      `找不到「${CALENDAR_NAME}」行事曆。請先在 Calendar.app 手動建立一個 iCloud 帳號底下、名稱為「${CALENDAR_NAME}」的行事曆（File > New Calendar，帳號選 iCloud），再重跑一次。`
    );
  }
}

function ensureReminderListExists(listName) {
  // 跟 Notes.app 一樣的坑：直接對 application 層級 make new list 會噴
  // -1728「無法取得部分物件」，必須先 tell account 才能建立。
  runAppleScript(`
tell application "Reminders"
  if not (exists list "${escapeAS(listName)}") then
    tell account "${escapeAS(REMINDER_ACCOUNT_NAME)}"
      make new list with properties {name:"${escapeAS(listName)}"}
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
  const listName = reminderListName(task);
  ensureReminderListExists(listName);
  // 沒有明確時間的任務用 allday due date（而不是 due date 硬設成 00:00），
  // 這樣 Reminders.app 顯示的才是「整天」而不是一個凌晨 12:00 的假時間點。
  const dueProp = task.time ? 'due date' : 'allday due date';
  const script = `
set dueDate to current date
${dateAssignLines('dueDate', task.date, task.time)}
tell application "Reminders"
  tell list "${escapeAS(listName)}"
    set newReminder to make new reminder with properties {name:"${escapeAS(task.title)}", ${dueProp}:dueDate, body:"${escapeAS(task.notes)}"}
    return id of newReminder
  end tell
end tell
`;
  return runAppleScript(script);
}

function updateReminder(appleId, task) {
  const listName = reminderListName(task);
  ensureReminderListExists(listName);
  const dueProp = task.time ? 'due date' : 'allday due date';
  // 用 id 全域找 reminder（不必先 tell 進某個 list），找到後比對目前所在的
  // list 跟這次算出來的目標 list 是否一致，不一致就用 move 搬過去——
  // 這是既有任務因為日期沒變、只是內容更新時，順便把它從舊的「Life.os」
  // 大清單搬進對應日期清單的唯一機會（id 若日期真的變了，本來就會是新 id）。
  const script = `
set dueDate to current date
${dateAssignLines('dueDate', task.date, task.time)}
tell application "Reminders"
  set theReminder to (first reminder whose id is "${escapeAS(appleId)}")
  set properties of theReminder to {name:"${escapeAS(task.title)}", ${dueProp}:dueDate, body:"${escapeAS(task.notes)}"}
  if (name of container of theReminder) is not "${escapeAS(listName)}" then
    move theReminder to list "${escapeAS(listName)}"
  end if
end tell
`;
  try {
    runAppleScript(script);
    return true;
  } catch (e) {
    return false;
  }
}

function ensureReminderInList(appleId, task) {
  // 內容沒變（contentHash 相同）就不會走 updateReminder，但舊資料可能還停在
  // 改版前的單一「Life.os」清單、且用的是舊版「due date 硬設 00:00」而不是
  // allday due date，所以略過分支也要單獨補做一次搬清單＋修正整天旗標，
  // 否則舊任務會永遠卡在 Life.os、永遠顯示凌晨 12:00，等不到「日期變了產生
  // 新 id」這種自然遷移的機會。
  const listName = reminderListName(task);
  ensureReminderListExists(listName);
  const dueProp = task.time ? 'due date' : 'allday due date';
  const script = `
set dueDate to current date
${dateAssignLines('dueDate', task.date, task.time)}
tell application "Reminders"
  set theReminder to (first reminder whose id is "${escapeAS(appleId)}")
  set ${dueProp} of theReminder to dueDate
  if (name of container of theReminder) is not "${escapeAS(listName)}" then
    move theReminder to list "${escapeAS(listName)}"
  end if
end tell
`;
  try {
    runAppleScript(script);
  } catch (e) {
    // 找不到就算了，交給下次 update/create 分支處理
  }
}

function completeReminder(appleId) {
  const script = `
tell application "Reminders"
  set completed of (first reminder whose id is "${escapeAS(appleId)}") to true
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
  // Reminders 清單改成依任務日期動態建立，見 createReminder/updateReminder。

  const state = readJSON(STATE_PATH, {});
  const caldavState = readJSON(CALDAV_STATE_PATH, {});
  const seenIds = new Set();

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let removed = 0;

  for (const task of tasks) {
    seenIds.add(task.id);

    // 這個事件雲端版已經同步過、本機這邊還沒建過任何紀錄 -> 視為已同步，直接略過，
    // 不然雲端跑過一次、使用者稍晚手動跑本機版，會在 Calendar 建出重複事件。
    if (task.type === 'event' && caldavState[task.id] && !state[task.id]) {
      skipped++;
      continue;
    }

    const hash = contentHash(task);
    const existing = state[task.id];

    if (!existing) {
      const appleId = task.type === 'event' ? createCalendarEvent(task) : createReminder(task);
      state[task.id] = { contentHash: hash, type: task.type, appleId, updatedAt: new Date().toISOString() };
      created++;
      continue;
    }

    if (existing.contentHash === hash) {
      if (existing.type === 'reminder') {
        ensureReminderInList(existing.appleId, task);
      }
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
