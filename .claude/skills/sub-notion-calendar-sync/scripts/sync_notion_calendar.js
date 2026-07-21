#!/usr/bin/env node
'use strict';

/**
 * 把 sub-daily-check 產出的 02-zettelkasten/03-Calendar/<date>/<date>.md 單向同步進 Notion
 * 一個「已經手動建好」的資料庫（Daily-Sync：名稱／日期／標籤），一天一列。
 *
 * 跟 sub-notion-sync（01-Inbox 卡片雙向同步）的差異：
 *   - 這支只有 push 方向，沒有 pull，因為 Calendar 資料已經有自己的任務流真相來源
 *     （tasks.json，由 sub-caldav-sync/sub-apple-sync 消費），貿然雙向會撞上「誰控制狀態」
 *     的衝突偵測問題（sub-notion-sync 的 pilot 階段也還沒解決這個）。
 *   - 資料庫是使用者已經手動建好的，不像 Inbox 那支會自動建立，所以這裡要靠
 *     NOTION_DAILY_SYNC_DATABASE_ID 解析一次 data_source_id，之後快取進 state。
 *   - `標籤`（使用者拿來標記完成狀態用）是使用者在 Notion 上手動改的欄位，create/update
 *     送出的 properties 都刻意不帶這個欄位——Notion API 對沒帶到的屬性不會有任何動作，
 *     永遠不會被腳本蓋掉。
 *
 * Usage:
 *   node sync_notion_calendar.js <path-to-date.md>   單一天（core-cloud-sync 平常呼叫的方式）
 *   node sync_notion_calendar.js --all               掃 02-zettelkasten/03-Calendar/ 底下全部
 *                                                     <date>/<date>.md 補跑一輪（一次性回補用，
 *                                                     已同步過、內容沒變的日子會自動跳過）
 *
 * 需要的環境變數：
 *   NOTION_API_KEY               Notion internal integration 的 token（跟 sub-notion-sync 共用）
 *   NOTION_DAILY_SYNC_DATABASE_ID 只有 state file 裡還沒快取 _dataSourceId 時需要：
 *                                 「Daily-Sync」資料庫的 id（從 Notion 網址複製）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('@notionhq/client');
const { markdownToBlocks } = require('@tryfabric/martian');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const CALENDAR_ROOT = path.join(REPO_ROOT, '02-zettelkasten', '03-Calendar');
const STATE_PATH = path.join(REPO_ROOT, '03-schedule', '00-設定檔', '.notion-calendar-sync-state.json');
const TITLE_PROP = '名稱';
const DATE_PROP = '日期';

function readJSON(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJSON(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function contentHash(raw) {
  return crypto.createHash('sha1').update(raw, 'utf8').digest('hex');
}

// 檔名（不含副檔名）就是 YYYY-MM-DD，跟 tasks.json 裡的 date 欄位、資料夾名稱一致。
function dateFromPath(mdPath) {
  return path.basename(mdPath, '.md');
}

// Title 取檔案第一行 heading（去掉開頭的 # 與空白），拿不到就退回日期字串本身。
function titleFromContent(raw, fallbackDate) {
  const firstLine = raw.split(/\r?\n/, 1)[0] || '';
  const stripped = firstLine.replace(/^#+\s*/, '').trim();
  return stripped || fallbackDate;
}

// --all 模式：掃 02-zettelkasten/03-Calendar/ 底下每個 <date>/ 資料夾，
// 找同名的 <date>.md（跟 sub-daily-check 的產出慣例一致），照日期排序回傳。
function listAllDateMdFiles() {
  if (!fs.existsSync(CALENDAR_ROOT)) return [];
  const results = [];
  for (const entry of fs.readdirSync(CALENDAR_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const mdPath = path.join(CALENDAR_ROOT, entry.name, `${entry.name}.md`);
    if (fs.existsSync(mdPath)) results.push(mdPath);
  }
  return results.sort();
}

async function ensureDataSource(notion, state) {
  if (state._dataSourceId) return state._dataSourceId;

  const databaseId = process.env.NOTION_DAILY_SYNC_DATABASE_ID;
  if (!databaseId) {
    throw new Error('請設定 NOTION_DAILY_SYNC_DATABASE_ID 環境變數（「Daily-Sync」資料庫的 id，從 Notion 網址複製）。');
  }

  const db = await notion.databases.retrieve({ database_id: databaseId });
  state._databaseId = db.id;
  state._dataSourceId = db.data_sources[0].id;
  console.log(`已連上 Notion「Daily-Sync」資料庫（database: ${db.id}），之後不用再帶 NOTION_DAILY_SYNC_DATABASE_ID。`);
  return state._dataSourceId;
}

function buildProperties(title, date) {
  return {
    [TITLE_PROP]: { title: [{ text: { content: title } }] },
    [DATE_PROP]: { date: { start: date } },
    // 標籤 故意不帶：使用者在 Notion 上手動改的欄位，腳本永遠不會寫入或覆蓋它。
  };
}

async function appendBlocksInChunks(notion, pageId, blocks) {
  for (let i = 0; i < blocks.length; i += 100) {
    await notion.blocks.children.append({ block_id: pageId, children: blocks.slice(i, i + 100) });
  }
}

async function replacePageContent(notion, pageId, blocks) {
  let cursor;
  const existing = [];
  do {
    const res = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor });
    existing.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  for (const block of existing) {
    await notion.blocks.delete({ block_id: block.id });
  }
  await appendBlocksInChunks(notion, pageId, blocks);
}

// 回傳 'created' | 'updated' | 'skipped'，同時就地更新 state（呼叫端負責寫回檔案）。
async function syncOneFile(notion, state, dataSourceId, mdPath) {
  const raw = fs.readFileSync(mdPath, 'utf8');
  const date = dateFromPath(mdPath);
  const title = titleFromContent(raw, date);
  const hash = contentHash(raw);
  const existing = state[date];

  if (existing && existing.contentHash === hash) {
    return 'skipped';
  }

  const blocks = markdownToBlocks(raw || ' ');
  const properties = buildProperties(title, date);

  if (!existing) {
    const page = await notion.pages.create({
      parent: { type: 'data_source_id', data_source_id: dataSourceId },
      properties,
      children: blocks.slice(0, 100),
    });
    if (blocks.length > 100) await appendBlocksInChunks(notion, page.id, blocks.slice(100));
    state[date] = { pageId: page.id, contentHash: hash, updatedAt: new Date().toISOString() };
    return 'created';
  }

  await notion.pages.update({ page_id: existing.pageId, properties });
  await replacePageContent(notion, existing.pageId, blocks);
  state[date] = { pageId: existing.pageId, contentHash: hash, updatedAt: new Date().toISOString() };
  return 'updated';
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node sync_notion_calendar.js <path-to-date.md> | --all');
    process.exit(1);
  }

  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    console.error('請設定 NOTION_API_KEY 環境變數（Notion internal integration 的 token）。');
    process.exit(1);
  }

  let targets;
  if (arg === '--all') {
    targets = listAllDateMdFiles();
    if (targets.length === 0) {
      console.error(`${CALENDAR_ROOT} 底下找不到任何 <date>/<date>.md。`);
      process.exit(1);
    }
  } else {
    const mdPath = path.resolve(arg);
    if (!fs.existsSync(mdPath)) {
      console.error(`找不到檔案: ${mdPath}`);
      process.exit(1);
    }
    targets = [mdPath];
  }

  const notion = new Client({ auth: apiKey });
  const state = readJSON(STATE_PATH, {});
  const dataSourceId = await ensureDataSource(notion, state);
  // ensureDataSource 可能剛解析出 _databaseId/_dataSourceId，先落地一次，
  // 避免 --all 掃很多天、中途某天失敗時，連這個都要重解一次。
  writeJSON(STATE_PATH, state);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const mdPath of targets) {
    const date = dateFromPath(mdPath);
    try {
      const result = await syncOneFile(notion, state, dataSourceId, mdPath);
      if (result === 'created') created++;
      else if (result === 'updated') updated++;
      else skipped++;
      writeJSON(STATE_PATH, state); // 每處理完一天就落地一次，中途失敗也不會丟掉前面的進度
    } catch (err) {
      failed++;
      console.error(`  ${date} 失敗：`, (err && err.body) || (err && err.message) || err);
    }
  }

  const failedNote = failed ? `、失敗 ${failed} 筆` : '';
  console.log(`sub-notion-calendar-sync 完成：新增 ${created} 筆、更新 ${updated} 筆、略過 ${skipped} 筆（未變動）${failedNote}。`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('sub-notion-calendar-sync 執行失敗：', (err && err.body) || (err && err.message) || err);
  process.exit(1);
});
