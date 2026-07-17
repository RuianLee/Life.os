#!/usr/bin/env node
'use strict';

/**
 * 讀取 sub-daily-check 產出的 tasks.json，透過 CalDAV 直連 iCloud 寫入 Calendar 事件
 * （type === "event" 的任務）。跟本機版 sub-apple-sync/scripts/sync.js 的差異：這支不需要
 * 本機 Mac、不用 osascript，靠 tsdav 這個 CalDAV client 直接對 caldav.icloud.com 說話，
 * 所以可以在 GitHub Actions 這種雲端 runner 上跑，寫進去後會經 iCloud 自動同步到 iPhone。
 *
 * 只處理 Calendar 事件，刻意不處理 Reminders 也不處理 Notes（都是實測過的 iCloud 限制，
 * 不是偷懶跳過）：
 *  - Notes 沒有公開的 CalDAV/API，只能靠本機 osascript（見 sync_notes.js）。
 *  - Reminders 更徹底：對這個帳號的 calendar-home-set 做完全不經過濾的原始 PROPFIND，
 *    底下只有 9 個 collection，使用者在 Reminders.app 裡真正在用的「2026-07-16」
 *    「2026-07-17」…這些每日清單完全不存在，唯一找得到的 VTODO collection 叫
 *    「提醒事項 ⚠️」——這個警告符號是 Apple 伺服器自己回傳的名稱，不是我們加的，
 *    幾乎可以確定是官方標記的舊版相容殘留物。實測往裡面寫，iCloud 伺服器會回 201
 *    接受，但 Reminders.app（含「所有提醒事項」彙總視角）完全不會顯示——資料進了
 *    iCloud 某個跟 Reminders app 沒有真正連接的角落。這是 Apple 這幾年把 Reminders
 *    換成私有同步協定、只留殘缺相容外殼的已知限制，不是我們能繞過的東西。
 *
 * 所以 Reminders 跟 Notes 一樣，維持交給本機的 /core-daily-sync（sub-apple-sync）處理。
 *
 * Usage: node sync_caldav.js <path-to-tasks.json>
 *
 * 需要的環境變數：
 *   APPLE_ID_EMAIL              Apple ID 信箱
 *   APPLE_APP_SPECIFIC_PASSWORD 在 appleid.apple.com 產生的「App 專用密碼」（不是登入密碼）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DAVClient } = require('tsdav');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const STATE_PATH = path.join(REPO_ROOT, 'schedule', '.caldav-sync-state.json');
// 本機版 sub-apple-sync 的狀態檔：兩條路徑都會寫進同一個 iCloud「daily」行事曆，
// 這裡拿來判斷「這個事件是不是本機已經同步過了」，避免使用者剛手動跑完本機版、
// 當天稍晚雲端排程又跑一次，在 Calendar 建出重複事件。
const APPLE_STATE_PATH = path.join(REPO_ROOT, 'schedule', '.apple-sync-state.json');
const CALENDAR_NAME = 'daily';
const UID_SUFFIX = '@life.os';

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

// RFC 5545 文字欄位跳脫：反斜線、分號、逗號、換行都要跳脫，否則 iCloud 可能整筆拒收或解析錯亂。
function icsEscape(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function nowUtcIcs() {
  return new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function formatUtcIcs(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
}

// 台灣固定 UTC+8、沒有日光節約時間，直接減 8 小時换算，不需要額外帶 VTIMEZONE。
function taipeiToUtcDate(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 8, mm));
}

function buildEventIcs(task) {
  const startDate = taipeiToUtcDate(task.date, task.time);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 跟本機版一樣，預設 1 小時長度

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Life.os//sub-caldav-sync//EN',
    'BEGIN:VEVENT',
    `UID:${task.id}${UID_SUFFIX}`,
    `DTSTAMP:${nowUtcIcs()}`,
    `DTSTART:${formatUtcIcs(startDate)}`,
    `DTEND:${formatUtcIcs(endDate)}`,
    `SUMMARY:${icsEscape(task.title)}`,
    `DESCRIPTION:${icsEscape(task.notes)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

async function findTargetCalendar(client) {
  const calendars = await client.fetchCalendars();
  const eventCal = calendars.find(
    (c) => (c.displayName || '').trim() === CALENDAR_NAME && (c.components || []).includes('VEVENT')
  );
  if (!eventCal) {
    throw new Error(
      `找不到 iCloud 底下叫「${CALENDAR_NAME}」的行事曆。請先在 Calendar.app 手動建立一個（File > New Calendar，帳號選 iCloud，命名為 ${CALENDAR_NAME}）。`
    );
  }
  return eventCal;
}

async function createEvent(client, calendar, task) {
  const filename = `${task.id}.ics`;
  const res = await client.createCalendarObject({ calendar, filename, iCalString: buildEventIcs(task) });
  if (!res.ok) {
    throw new Error(`建立失敗（${res.status} ${res.statusText}）：${task.title}`);
  }
  return {
    url: new URL(filename, calendar.url).href,
    etag: res.headers.get('etag') || undefined,
  };
}

async function updateEvent(client, entry, task) {
  const res = await client.updateCalendarObject({
    calendarObject: { url: entry.url, data: buildEventIcs(task), etag: entry.etag },
  });
  if (!res.ok) return null;
  return { url: entry.url, etag: res.headers.get('etag') || undefined };
}

async function deleteEvent(client, entry) {
  try {
    const res = await client.deleteCalendarObject({ calendarObject: { url: entry.url, etag: entry.etag } });
    return res.ok || res.status === 404;
  } catch (e) {
    return false;
  }
}

async function main() {
  const tasksArg = process.argv[2];
  if (!tasksArg) {
    console.error('Usage: node sync_caldav.js <path-to-tasks.json>');
    process.exit(1);
  }

  const username = process.env.APPLE_ID_EMAIL;
  const password = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  if (!username || !password) {
    console.error('請設定 APPLE_ID_EMAIL / APPLE_APP_SPECIFIC_PASSWORD 環境變數。');
    process.exit(1);
  }

  const tasksPath = path.resolve(tasksArg);
  const allTasks = readJSON(tasksPath, null);
  if (!allTasks) {
    console.error(`找不到 tasks.json: ${tasksPath}`);
    process.exit(1);
  }
  const tasks = allTasks.filter((t) => t.type === 'event');

  const client = new DAVClient({
    serverUrl: 'https://caldav.icloud.com',
    credentials: { username, password },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });
  await client.login();

  const calendar = await findTargetCalendar(client);

  const state = readJSON(STATE_PATH, {});
  const appleState = readJSON(APPLE_STATE_PATH, {});
  const seenIds = new Set();

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let removed = 0;

  for (const task of tasks) {
    seenIds.add(task.id);

    // 本機版已經同步過、雲端這邊還沒建過任何紀錄 -> 視為已同步，直接略過，
    // 不然使用者剛手動跑完本機版，當天稍晚雲端排程又跑一次會建出重複事件。
    if (appleState[task.id] && !state[task.id]) {
      skipped++;
      continue;
    }

    const hash = contentHash(task);
    const existing = state[task.id];

    if (!existing) {
      const entry = await createEvent(client, calendar, task);
      state[task.id] = { ...entry, contentHash: hash, updatedAt: new Date().toISOString() };
      created++;
      continue;
    }

    if (existing.contentHash === hash) {
      skipped++;
      continue;
    }

    const updatedEntry = await updateEvent(client, existing, task);
    if (updatedEntry) {
      state[task.id] = { ...updatedEntry, contentHash: hash, updatedAt: new Date().toISOString() };
      updated++;
    } else {
      // 找不到既有物件（可能被手動刪除）-> 視為新建
      const entry = await createEvent(client, calendar, task);
      state[task.id] = { ...entry, contentHash: hash, updatedAt: new Date().toISOString() };
      created++;
    }
  }

  // 反向清理：state 裡有、但這次 tasks.json 已經沒有的事件（日期已過或來源已被搬到 trash-can）
  for (const id of Object.keys(state)) {
    if (seenIds.has(id)) continue;
    await deleteEvent(client, state[id]);
    delete state[id];
    removed++;
  }

  writeJSON(STATE_PATH, state);

  console.log(`sub-caldav-sync 完成：新增 ${created} 筆、更新 ${updated} 筆、略過 ${skipped} 筆（未變動）、清除 ${removed} 筆。`);
}

main().catch((err) => {
  console.error('sub-caldav-sync 執行失敗：', err);
  process.exit(1);
});
