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
 * 「一任務一卡片＋大表索引」格式（sub-daily-check 改版後產生的 <date>/tasks/*.md）：
 *   - 每張本機任務卡片同步成當天 Notion page 底下的一個子頁面（parent: page_id），
 *     子頁面內容是卡片的 checkbox + 補充說明。
 *   - 當天 <date>.md 的大表（時間／任務／分類／卡片）不是整份文字直接轉 blocks，而是
 *     解析出表格資料後，重新組成一個 Notion table block，「卡片」欄位改成 mention 真正
 *     的子頁面（本機的相對連結 `tasks/xxx.md` 在 Notion 裡點了不會生效，所以不能照抄）。
 *   - 沒有 tasks/ 資料夾的舊格式日期（改版前產生的）維持原本「整份 <date>.md 轉 blocks」
 *     的行為，不受影響。
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
const KIND_PROP = '種類';
const KIND_SUMMARY = '總結'; // 當天彙總那一列
const KIND_TASK = '任務'; // 個別任務那一列
const STATUS_PROP = '完成';
const STATUS_DEFAULT = '未開始';

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

// 解析卡片檔案的 frontmatter（--- 包起來的區塊）＋內文。
function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!mm) continue;
    let val = mm[2].trim();
    if (val === 'null' || val === '') val = null;
    else if (/^".*"$/.test(val)) val = val.slice(1, -1);
    meta[mm[1]] = val;
  }
  return { meta, body: m[2].replace(/^\r?\n/, '') };
}

// 讀 <date>/tasks/ 底下每張任務卡片，回傳 [{file, filePath, raw, meta, body}]。
// tasks/ 不存在（改版前的舊格式日期）就回傳空陣列。
function listTaskCards(tasksDir) {
  if (!fs.existsSync(tasksDir)) return [];
  return fs
    .readdirSync(tasksDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const filePath = path.join(tasksDir, f);
      const raw = fs.readFileSync(filePath, 'utf8');
      const { meta, body } = parseFrontmatter(raw);
      return { file: f, filePath, raw, meta, body };
    });
}

// 解析「大表」：開頭說明文字（preamble）＋表格列（時間／任務／分類／卡片連結）。
// 找不到表格（cards.length === 0，也就是舊格式）就回傳 null，呼叫端會走舊邏輯。
function parseIndexTable(raw) {
  const lines = raw.split(/\r?\n/);
  const tableStart = lines.findIndex((l) => /^\s*\|.*\|\s*$/.test(l));
  if (tableStart === -1) return null;

  const preamble = lines.slice(0, tableStart).join('\n').trimEnd();
  const rows = [];
  for (let i = tableStart; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*\|.*\|\s*$/.test(line)) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 4) continue;
    if (cells[0] === '時間') continue; // 表頭列
    if (/^-+$/.test(cells[0].replace(/[: ]/g, ''))) continue; // |---|---|---|---| 分隔列

    const cardMatch = cells[3].match(/tasks\/([^)]+\.md)/);
    const cardFile = cardMatch ? cardMatch[1] : null;
    const idMatch = cardFile ? cardFile.match(/^([0-9a-f]{12})_/) : null;
    rows.push({
      time: cells[0],
      title: cells[1],
      category: cells[2],
      cardFile,
      taskId: idMatch ? idMatch[1] : null,
    });
  }
  return { preamble, rows };
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

// kind 是 KIND_SUMMARY（當天彙總列）或 KIND_TASK（任務列），每次 create/update 都會帶，
// 因為這個欄位是結構性的、不是使用者會手動改的資料，不用怕覆蓋掉使用者的東西。
function buildProperties(title, date, kind) {
  return {
    [TITLE_PROP]: { title: [{ text: { content: title } }] },
    [DATE_PROP]: { date: { start: date } },
    [KIND_PROP]: { select: { name: kind } },
    // 標籤 故意不帶：使用者在 Notion 上手動改的欄位，腳本永遠不會寫入或覆蓋它。
  };
}

// 只在「新建」那一列時呼叫，給一個預設的完成狀態。之後使用者會手動把這個欄位改成
// 進行中/已完成，所以 update 時絕對不能再帶這個欄位，否則會把使用者的進度打回原形。
function defaultStatusProperty() {
  return { [STATUS_PROP]: { select: { name: STATUS_DEFAULT } } };
}

async function appendBlocksInChunks(notion, pageId, blocks) {
  for (let i = 0; i < blocks.length; i += 100) {
    await notion.blocks.children.append({ block_id: pageId, children: blocks.slice(i, i + 100) });
  }
}

// 重建一個 page 的內容：清掉舊 block、換成新的一批 block。
// 危險陷阱：`child_page`（子頁面連結）這種 block 如果被刪除，Notion 會把它代表的
// 那個子頁面整個丟進垃圾桶，不是單純從清單移除——所以清舊內容時一定要跳過
// `child_page`（保險起見連 `child_database` 也一併跳過），只刪普通內容 block。
async function replacePageContent(notion, pageId, blocks) {
  let cursor;
  const existing = [];
  do {
    const res = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor });
    existing.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  for (const block of existing) {
    if (block.type === 'child_page' || block.type === 'child_database') continue;
    await notion.blocks.delete({ block_id: block.id });
  }
  await appendBlocksInChunks(notion, pageId, blocks);
}

// 把一張任務卡片同步成 Daily-Sync／Calendar 資料庫裡的一列（不是子頁面，是跟「當天」
// 那筆記錄同一個資料庫的另一列），名稱前綴任務所屬日期，例如
// 「2026-07-21-書報、聖經（40/20分鐘）」，方便使用者在其他資料庫用 Relation 屬性直接
// 關聯到個別任務（子頁面不是資料庫項目，Notion 的 Relation 屬性選不到）。
// 內容沒變（跟 state.tasks[id].contentHash 比對）就直接回傳既有 pageId，不打 API。
async function syncTaskCard(notion, state, dataSourceId, dayDate, card) {
  if (!state.tasks) state.tasks = {};
  const id = card.meta.id;
  const taskDate = card.meta.date || dayDate;
  const title = `${taskDate}-${card.meta.title || card.file}`;
  const hash = contentHash(card.raw);
  const existing = state.tasks[id];
  // 舊版（子頁面掛在當天 page 底下）存的是 dayPageId、沒有 date 欄位；用這個分辨
  // 「這筆 state 紀錄是不是已經是資料庫列版本」，不是就當作沒同步過，走建立新列的分支
  // （不能沿用舊的子頁面 id 直接 update——那個 page 的 parent 是子頁面，不是資料庫列，
  // 沒辦法用 pages.update 把它「搬進」資料庫）。
  const isDatabaseRow = existing && existing.date;

  if (isDatabaseRow && existing.contentHash === hash) {
    return existing.pageId;
  }

  const blocks = markdownToBlocks(card.body || ' ');
  const properties = buildProperties(title, taskDate, KIND_TASK);

  if (isDatabaseRow) {
    // update：不帶 完成，使用者可能已經手動把這筆改成進行中/已完成，不能覆蓋回去。
    await notion.pages.update({ page_id: existing.pageId, properties });
    await replacePageContent(notion, existing.pageId, blocks);
    state.tasks[id] = { pageId: existing.pageId, contentHash: hash, date: taskDate };
    return existing.pageId;
  }

  const page = await notion.pages.create({
    parent: { type: 'data_source_id', data_source_id: dataSourceId },
    properties: { ...properties, ...defaultStatusProperty() },
    children: blocks.slice(0, 100),
  });
  if (blocks.length > 100) await appendBlocksInChunks(notion, page.id, blocks.slice(100));
  state.tasks[id] = { pageId: page.id, contentHash: hash, date: taskDate };
  return page.id;
}

// 用表格列資料＋已同步好的任務子頁面 id，組出一個 Notion table block。
// 「卡片」欄位是 mention 真正的子頁面；找不到對應子頁面（例如卡片檔名不合慣例）就退回純文字。
function buildIndexTableBlock(rows, taskPageIds) {
  const headerCell = (text) => [{ type: 'text', text: { content: text } }];
  const header = {
    object: 'block',
    type: 'table_row',
    table_row: { cells: [headerCell('時間'), headerCell('任務'), headerCell('分類'), headerCell('卡片')] },
  };
  const dataRows = rows.map((r) => {
    const pageId = r.taskId && taskPageIds[r.taskId];
    const cardCell = pageId
      ? [{ type: 'mention', mention: { type: 'page', page: { id: pageId } } }]
      : [{ type: 'text', text: { content: r.cardFile || '（找不到對應卡片）' } }];
    return {
      object: 'block',
      type: 'table_row',
      table_row: {
        cells: [headerCell(r.time || ''), headerCell(r.title || ''), headerCell(r.category || ''), cardCell],
      },
    };
  });
  return {
    object: 'block',
    type: 'table',
    table: { table_width: 4, has_column_header: true, has_row_header: false, children: [header, ...dataRows] },
  };
}

// 回傳 'created' | 'updated' | 'skipped'，同時就地更新 state（呼叫端負責寫回檔案）。
async function syncOneFile(notion, state, dataSourceId, mdPath) {
  const raw = fs.readFileSync(mdPath, 'utf8');
  const date = dateFromPath(mdPath);
  const title = titleFromContent(raw, date);
  const tasksDir = path.join(path.dirname(mdPath), 'tasks');
  const cards = listTaskCards(tasksDir);
  const parsedTable = cards.length ? parseIndexTable(raw) : null;

  // 舊格式（沒有 tasks/，或解析不出表格）：整份 <date>.md 轉 blocks，行為跟改版前一致。
  if (!parsedTable) {
    const hash = contentHash(raw);
    const existing = state[date];
    if (existing && existing.contentHash === hash) return 'skipped';

    const blocks = markdownToBlocks(raw || ' ');
    const properties = buildProperties(title, date, KIND_SUMMARY);

    if (!existing) {
      const page = await notion.pages.create({
        parent: { type: 'data_source_id', data_source_id: dataSourceId },
        properties: { ...properties, ...defaultStatusProperty() },
        children: blocks.slice(0, 100),
      });
      if (blocks.length > 100) await appendBlocksInChunks(notion, page.id, blocks.slice(100));
      state[date] = { pageId: page.id, contentHash: hash, updatedAt: new Date().toISOString() };
      return 'created';
    }

    // update：不帶 完成，理由同任務列。
    await notion.pages.update({ page_id: existing.pageId, properties });
    await replacePageContent(notion, existing.pageId, blocks);
    state[date] = { pageId: existing.pageId, contentHash: hash, updatedAt: new Date().toISOString() };
    return 'updated';
  }

  // 新格式（一任務一卡片＋大表索引）：每張卡片各自同步成同一個資料庫裡的另一列
  // （名稱前綴日期），大表的「卡片」欄位改 mention 那一列對應的 page。
  const combinedHash = contentHash(raw + ' ' + cards.map((c) => c.raw).join(' '));
  const existing = state[date];
  if (existing && existing.contentHash === combinedHash) return 'skipped';

  const properties = buildProperties(title, date, KIND_SUMMARY);
  let dayPageId = existing && existing.pageId;
  if (!dayPageId) {
    const page = await notion.pages.create({
      parent: { type: 'data_source_id', data_source_id: dataSourceId },
      properties: { ...properties, ...defaultStatusProperty() },
      children: [],
    });
    dayPageId = page.id;
  } else {
    // update：不帶 完成，理由同任務列。
    await notion.pages.update({ page_id: dayPageId, properties });
  }

  const taskPageIds = {};
  for (const card of cards) {
    if (!card.meta.id) continue;
    taskPageIds[card.meta.id] = await syncTaskCard(notion, state, dataSourceId, date, card);
  }

  const preambleBlocks = parsedTable.preamble ? markdownToBlocks(parsedTable.preamble) : [];
  const tableBlock = buildIndexTableBlock(parsedTable.rows, taskPageIds);
  await replacePageContent(notion, dayPageId, [...preambleBlocks, tableBlock]);

  state[date] = { pageId: dayPageId, contentHash: combinedHash, updatedAt: new Date().toISOString() };
  return existing ? 'updated' : 'created';
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
