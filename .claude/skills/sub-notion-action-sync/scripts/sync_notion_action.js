#!/usr/bin/env node
'use strict';

/**
 * 把 sub-daily-check 產出的 02-zettelkasten/03-Calendar/<date>/tasks.json 單向同步進 Notion
 * 「睿恩的行動任務庫（Action）」資料庫，一筆任務一列（跟舊版 sub-notion-calendar-sync 的
 * 「一天一列、整篇 markdown 塞進 page body」完全不同模型）。
 *
 * 設計重點：
 *   - 去重鍵是 tasks.json 裡每筆任務自帶的 `id`（sha1(source_file+date+title) 前 12 碼），
 *     不是日期。tasks.json 本身是滾動視窗（今天的檔案也包含未來一週的任務），同一筆任務
 *     在好幾天的檔案裡重複出現時，id 相同 → 視為同一筆、只更新不重建。
 *   - 「行動狀態」只在建立時給預設值（尚未開始），之後 update 完全不帶這個屬性——
 *     使用者在 Notion 上勾選的進度不會被同步跑掉，跟舊版保護「標籤」欄位同一個邏輯。
 *   - 「專案項目」relation 只在建立時設成固定的 LifeOs 專案卡片，之後 update 也不帶這個屬性，
 *     避免使用者手動改分類又被同步蓋回去。
 *   - 只有 create/update，沒有刪除/封存：跟舊版一樣的保守設計。
 *
 * Usage:
 *   node sync_notion_action.js <path-to-tasks.json>   單一份 tasks.json（core-cloud-sync 平常呼叫的方式）
 *   node sync_notion_action.js --all                  掃 02-zettelkasten/03-Calendar/ 底下全部
 *                                                      <date>/tasks.json 補跑一輪（一次性回補用）
 *
 * 需要的環境變數：
 *   NOTION_API_KEY            Notion internal integration 的 token（跟 sub-notion-sync 共用）
 *   NOTION_ACTION_DATABASE_ID 只有 state file 裡還沒快取 _dataSourceId 時需要：
 *                              「睿恩的行動任務庫（Action）」資料庫的 id（從 Notion 網址複製）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('@notionhq/client');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const CALENDAR_ROOT = path.join(REPO_ROOT, '02-zettelkasten', '03-Calendar');
const STATE_PATH = path.join(REPO_ROOT, '03-schedule', '00-設定檔', '.notion-action-sync-state.json');

const TITLE_PROP = '行動任務卡片';
const DUE_PROP = '截止日';
const STATUS_PROP = '行動狀態';
const PROJECT_PROP = '專案項目';
const DEFAULT_STATUS = '尚未開始';
// 「睿恩的專案項目庫（Projects）」資料庫裡的 LifeOs 卡片，所有同步過去的任務都掛在這個專案下。
const LIFEOS_PROJECT_PAGE_ID = '3a46830c-2de7-80a6-878a-c0b791587d06';

function readJSON(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJSON(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function contentHash(task) {
  const raw = JSON.stringify({ title: task.title, date: task.date, time: task.time, notes: task.notes });
  return crypto.createHash('sha1').update(raw, 'utf8').digest('hex');
}

// --all 模式：掃 02-zettelkasten/03-Calendar/ 底下每個 <date>/ 資料夾，找同名的 tasks.json。
function listAllTaskFiles() {
  if (!fs.existsSync(CALENDAR_ROOT)) return [];
  const results = [];
  for (const entry of fs.readdirSync(CALENDAR_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const jsonPath = path.join(CALENDAR_ROOT, entry.name, 'tasks.json');
    if (fs.existsSync(jsonPath)) results.push(jsonPath);
  }
  return results.sort();
}

async function ensureDataSource(notion, state) {
  if (state._dataSourceId) return state._dataSourceId;

  const databaseId = process.env.NOTION_ACTION_DATABASE_ID;
  if (!databaseId) {
    throw new Error('請設定 NOTION_ACTION_DATABASE_ID 環境變數（「睿恩的行動任務庫（Action）」資料庫的 id，從 Notion 網址複製）。');
  }

  const db = await notion.databases.retrieve({ database_id: databaseId });
  state._databaseId = db.id;
  state._dataSourceId = db.data_sources[0].id;
  console.log(`已連上 Notion「睿恩的行動任務庫（Action）」資料庫（database: ${db.id}），之後不用再帶 NOTION_ACTION_DATABASE_ID。`);
  return state._dataSourceId;
}

function dueDateValue(task) {
  if (task.time) return `${task.date}T${task.time}:00+08:00`;
  return task.date;
}

function buildCreateProperties(task) {
  return {
    [TITLE_PROP]: { title: [{ text: { content: task.title } }] },
    [DUE_PROP]: { date: { start: dueDateValue(task) } },
    [PROJECT_PROP]: { relation: [{ id: LIFEOS_PROJECT_PAGE_ID }] },
    [STATUS_PROP]: { status: { name: DEFAULT_STATUS } },
  };
}

function buildUpdateProperties(task) {
  return {
    [TITLE_PROP]: { title: [{ text: { content: task.title } }] },
    [DUE_PROP]: { date: { start: dueDateValue(task) } },
    // 專案項目／行動狀態 故意不帶：使用者在 Notion 上可能手動改過分類或勾選進度，
    // 腳本永遠不會寫入或覆蓋這兩個屬性。
  };
}

// 回傳 'created' | 'updated' | 'skipped'，同時就地更新 state（呼叫端負責寫回檔案）。
async function syncOneTask(notion, state, dataSourceId, task) {
  const hash = contentHash(task);
  const existing = state[task.id];

  if (existing && existing.contentHash === hash) {
    return 'skipped';
  }

  if (!existing) {
    const page = await notion.pages.create({
      parent: { type: 'data_source_id', data_source_id: dataSourceId },
      properties: buildCreateProperties(task),
    });
    state[task.id] = { pageId: page.id, contentHash: hash, updatedAt: new Date().toISOString() };
    return 'created';
  }

  await notion.pages.update({ page_id: existing.pageId, properties: buildUpdateProperties(task) });
  state[task.id] = { pageId: existing.pageId, contentHash: hash, updatedAt: new Date().toISOString() };
  return 'updated';
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node sync_notion_action.js <path-to-tasks.json> | --all');
    process.exit(1);
  }

  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    console.error('請設定 NOTION_API_KEY 環境變數（Notion internal integration 的 token）。');
    process.exit(1);
  }

  let taskFiles;
  if (arg === '--all') {
    taskFiles = listAllTaskFiles();
    if (taskFiles.length === 0) {
      console.error(`${CALENDAR_ROOT} 底下找不到任何 <date>/tasks.json。`);
      process.exit(1);
    }
  } else {
    const jsonPath = path.resolve(arg);
    if (!fs.existsSync(jsonPath)) {
      console.error(`找不到檔案: ${jsonPath}`);
      process.exit(1);
    }
    taskFiles = [jsonPath];
  }

  const notion = new Client({ auth: apiKey });
  const state = readJSON(STATE_PATH, {});
  const dataSourceId = await ensureDataSource(notion, state);
  writeJSON(STATE_PATH, state);

  // 同一筆任務（相同 id）可能出現在多份 tasks.json 裡（滾動視窗），先合併去重再同步，
  // 避免同一次執行內對同一個 Notion page 呼叫兩次 update。
  const tasksById = new Map();
  for (const jsonPath of taskFiles) {
    const tasks = readJSON(jsonPath, []);
    for (const task of tasks) tasksById.set(task.id, task);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const task of tasksById.values()) {
    try {
      const result = await syncOneTask(notion, state, dataSourceId, task);
      if (result === 'created') created++;
      else if (result === 'updated') updated++;
      else skipped++;
      writeJSON(STATE_PATH, state); // 每處理完一筆就落地一次，中途失敗也不會丟掉前面的進度
    } catch (err) {
      failed++;
      console.error(`  ${task.id}（${task.title}）失敗：`, (err && err.body) || (err && err.message) || err);
    }
  }

  const failedNote = failed ? `、失敗 ${failed} 筆` : '';
  console.log(`sub-notion-action-sync 完成：新增 ${created} 筆、更新 ${updated} 筆、略過 ${skipped} 筆（未變動）${failedNote}。`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('sub-notion-action-sync 執行失敗：', (err && err.body) || (err && err.message) || err);
  process.exit(1);
});
