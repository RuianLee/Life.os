#!/usr/bin/env node
'use strict';

/**
 * Pilot：把 02-zettelkasten/01-Inbox/ 的卡片跟 Notion 資料庫做雙向同步。
 * 筆記流跟 daily-plan 的任務流不同，沒有「誰控制狀態」的問題，純粹是內容搬運＋轉檔：
 *   - push：repo 的 .md 卡片 -> Notion page（新建，或內容變了就更新）
 *   - pull：Notion 上沒有 RepoPath 的 page（代表是你直接在 Notion 生的）-> 抓回來新建 .md 卡片
 *
 * push 會處理卡片裡引用的本地圖片（見 extractLocalImages/resolvePlaceholderImages）：
 * 用 Notion File Upload API 把圖片傳上去、換成 image block，成功後刪除本地圖片檔案，並把
 * Notion 頁面網址寫回卡片 frontmatter 的 notion_url 欄位。本地檔案刪除後，之後卡片文字再變動
 * 需要重新 push 時，會沿用 state 裡記住的 file_upload_id 重建 image block，不會嘗試重新上傳
 * 一個已經不存在的本地檔案。
 *
 * Pilot 階段刻意先不解的限制：
 *   1. 沒有衝突偵測：兩邊都改了才跑同步，後跑的方向會蓋掉先跑那邊的改動。
 *   2. 圖片支援只有 push 方向；pull 回來的內容仍然只有文字，不會把 Notion 上的圖片存回本地。
 *   3. 範圍只有 01-Inbox/，其他分類資料夾（02-Atlas 等）之後視情況擴大。
 *
 * Notion API 從 2025 年的「multi-source database」改版後，資料庫底下多了一層 data source，
 * 建立資料庫時 schema 要放在 initial_data_source.properties，查詢頁面要用
 * dataSources.query（不是 databases.query），新增頁面的 parent 也要指到 data_source_id
 * （不是 database_id）——這支腳本已經按這個新模型寫，不是舊版 API 的寫法。
 *
 * Usage:
 *   node sync_notion.js push
 *   node sync_notion.js pull
 *
 * 需要的環境變數：
 *   NOTION_API_KEY        Notion internal integration 的 token
 *   NOTION_PARENT_PAGE_ID 只有「資料庫還沒建立」時需要：一個已分享給該 integration 的空白 page，
 *                          第一次執行 push 會在它底下自動建立資料庫，之後 id 存進 state file。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('@notionhq/client');
const { NotionToMarkdown } = require('notion-to-md');
const { markdownToBlocks } = require('@tryfabric/martian');
const matter = require('gray-matter');
const { diffLines } = require('diff');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const ZETTEL_ROOT = path.join(REPO_ROOT, '02-zettelkasten');
const INBOX_DIR = path.join(ZETTEL_ROOT, '01-Inbox');
const STATE_PATH = path.join(ZETTEL_ROOT, '.notion-sync-state.json');
const DATABASE_TITLE = '01-Inbox';
const DEFAULT_TYPE = '靈感筆記';

// ACCESS 架構（《卡片盒筆記法的數位實戰指南》）：02-zettelkasten/ 底下 7 個分類資料夾，
// 對應 Notion 那邊 7 個同名 page。這輪 pilot 只有 Inbox 底下會建資料庫做實際同步，
// 其他 6 個先建空頁面做「結構先對齊」，之後擴大範圍時再各自加資料庫。
// 03-Calendar 刻意排除：裡面裝的是 sub-daily-check 產出的每日待辦，不是 Zettelkasten 筆記，
// 已經有自己的同步管線（sub-caldav-sync/sub-apple-sync），這裡建空頁面只做視覺對齊、不管內容。
const STRUCTURE_PAGE_TITLES = ['Inbox', 'Atlas', 'Calendar', 'Card', 'Extra', 'Source', 'Space'];

function readJSON(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJSON(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function listCards() {
  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const relPath = path.relative(ZETTEL_ROOT, abs).split(path.sep).join('/');
        results.push({ relPath, absPath: abs });
      }
    }
  }
  if (fs.existsSync(INBOX_DIR)) walk(INBOX_DIR);
  return results;
}

// gray-matter 底層的 YAML parser 會把沒加引號的 `date: 2026-07-20` 自動轉成 JS Date 物件
// （YAML 1.1 的隱式型別轉換），不是字串。直接塞進 hash/Notion API 會因為時區、toString()
// 格式不穩定產生假的「內容變了」判斷，這裡統一轉回 UTC 的 YYYY-MM-DD 字串。
function formatDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  return String(value);
}

function parseCard(absPath) {
  const raw = fs.readFileSync(absPath, 'utf8');
  const parsed = matter(raw);
  return {
    raw,
    title: parsed.data.title || path.basename(absPath, '.md'),
    date: formatDate(parsed.data.date),
    type: parsed.data.type || DEFAULT_TYPE,
    tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
    body: parsed.content.trim(),
  };
}

function contentHash({ title, date, type, tags, body }) {
  const raw = [title, date || '', type, (tags || []).join(','), body].join('|');
  return crypto.createHash('sha1').update(raw, 'utf8').digest('hex');
}

function sanitizeFilename(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').trim() || 'untitled';
}

// 圖片支援：卡片內文裡「一整行只有圖片、沒有別的文字」的本地圖片參照，涵蓋三種常見寫法：
//   ![alt](01_圖片.png)                  獨立成段
//   - 重點文字                            list item 底下的接續行（縮排）
//     ![alt](01_圖片.png)
//   - ![alt](01_圖片.png)                 image 本身就是整個 list item（前面只有項目符號）
// martian 只認得絕對網址（http/https）才會轉成正確的 image block，本地相對路徑不是被整個
// 丟掉（縮排在 list item 底下的情況）就是退化成純文字（獨立成段/整個 list item 的情況）。
// 這裡的策略：
//   1. 逐行掃 body，比對到本地圖片參照就先用 Notion File Upload API 把檔案傳上去
//   2. 把那一行換成「去掉項目符號/縮排、前後補空行、網址換成假的 https 佔位網址」的版本，讓
//      martian 穩定產生一個獨立的 image block（不管原本是不是縮排在 list item 底下，或本身就
//      是整個 list item）
//   3. markdownToBlocks 轉完 blocks 之後，再用 resolvePlaceholderImages 把佔位網址換成
//      真正的 file_upload 參照
const IMAGE_MARKDOWN_LINE = /^[ \t]*(?:[-*+]|\d+[.)])?[ \t]*!\[([^\]]*)\]\(([^)\s]+)\)[ \t]*$/;
const PLACEHOLDER_HOST = 'https://__notion-image-upload__.invalid/';
const CONTENT_TYPE_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function isRemoteUrl(url) {
  return /^https?:\/\//i.test(url);
}

async function uploadImageFile(notion, absImagePath) {
  const filename = path.basename(absImagePath);
  const contentType = CONTENT_TYPE_BY_EXT[path.extname(filename).toLowerCase()] || 'application/octet-stream';
  const upload = await notion.fileUploads.create({ filename, content_type: contentType });
  // SDK 內部組 FormData 時，帶 filename 的情況下 value 一定要是 Blob，傳純 Buffer 進去
  // Node 原生 FormData.append 會直接丟 TypeError（實測重現過），這裡手動包一層 Blob。
  // Blob 一定要帶 type，不然多部分表單那個檔案 part 的 Content-Type 會變成預設的
  // application/octet-stream，跟 create 時宣告的 content_type（image/png 等）對不上，
  // Notion 會在 send 這步直接用 validation_error 擋下來（實測重現過）。
  await notion.fileUploads.send({
    file_upload_id: upload.id,
    file: { data: new Blob([fs.readFileSync(absImagePath)], { type: contentType }), filename },
  });
  return upload.id;
}

/**
 * 回傳：
 *   body                轉換過的 markdown（本地圖片行換成佔位網址，其餘不動）
 *   images              這次卡片實際引用到的圖片：{ 原始 markdown 路徑 -> file_upload_id }，存回 state
 *   uploadedLocalPaths  這次真的重新上傳的本地檔案絕對路徑，push 成功後才刪除
 *   placeholderById     佔位網址 -> file_upload_id，給 resolvePlaceholderImages 換回正確 block
 * cachedImages 是 state 裡這張卡片上次存的 images（本地檔案被刪過的話，靠它拿回舊的 file_upload_id）。
 */
async function extractLocalImages(notion, rawBody, cardDir, cachedImages) {
  // 有些卡片是 CRLF（Windows 換行）存的，只用 '\n' split 會在每行結尾留下 '\r'，
  // 讓 IMAGE_MARKDOWN_LINE 的 $ 錨點永遠對不上、整行圖片參照直接被當成一般文字放過
  // （實測重現過：13 張圖一張都沒處理，也不會有任何警告，因為根本沒被判定成圖片行）。
  const lines = rawBody.replace(/\r\n/g, '\n').split('\n');
  const images = {};
  const uploadedLocalPaths = [];
  const placeholderById = new Map();
  let placeholderIndex = 0;

  const outLines = [];
  for (const line of lines) {
    const match = line.match(IMAGE_MARKDOWN_LINE);
    if (!match) {
      outLines.push(line);
      continue;
    }

    const [, alt, rawImgPath] = match;
    if (isRemoteUrl(rawImgPath)) {
      outLines.push(line); // 已經是外部連結，交給 martian 正常處理
      continue;
    }

    const decodedPath = decodeURIComponent(rawImgPath);
    const absImagePath = path.resolve(cardDir, decodedPath);

    let fileUploadId = cachedImages[rawImgPath];
    if (fs.existsSync(absImagePath)) {
      fileUploadId = await uploadImageFile(notion, absImagePath);
      uploadedLocalPaths.push(absImagePath);
    } else if (!fileUploadId) {
      console.warn(`  警告：圖片參照找不到本地檔案、也沒有上傳紀錄，維持原樣：${rawImgPath}`);
      outLines.push(line);
      continue;
    }

    images[rawImgPath] = fileUploadId;
    placeholderIndex += 1;
    // martian 要看副檔名（.png 等）才會判定成圖片轉出 image block，佔位網址主機名本身
    // 是不是合法網域無所謂，路徑一定要留副檔名。
    const ext = path.extname(decodedPath) || '.png';
    const placeholderUrl = `${PLACEHOLDER_HOST}${placeholderIndex}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    placeholderById.set(placeholderUrl, fileUploadId);
    outLines.push('', `![${alt}](${placeholderUrl})`, '');
  }

  return { body: outLines.join('\n'), images, uploadedLocalPaths, placeholderById };
}

function resolvePlaceholderImages(blocks, placeholderById) {
  return blocks.map((block) => {
    if (block.type === 'image' && block.image.type === 'external' && placeholderById.has(block.image.external.url)) {
      return {
        object: 'block',
        type: 'image',
        image: { type: 'file_upload', file_upload: { id: placeholderById.get(block.image.external.url) } },
      };
    }
    return block;
  });
}

// 卡片開專屬資料夾通常只是為了放圖片（見 core-zettel-new 的慣例：--assets 才會開資料夾）。
// 圖片刪完之後，如果資料夾裡只剩這一個 .md，資料夾就沒有存在必要了：搬到上一層、改名成
// 「{資料夾名}.md」，原本的空資料夾刪掉。資料夾裡如果還有別的檔案（例如同一批筆記共用一個
// 圖片資料夾），維持原樣不動，不強行拆開。只攤平一層——多層巢狀資料夾不會連續往上攤平。
function flattenSingleCardFolder(cardDir, absPath) {
  const remaining = fs.readdirSync(cardDir);
  if (remaining.length !== 1 || remaining[0] !== path.basename(absPath)) return null;

  const parentDir = path.dirname(cardDir);
  const folderName = path.basename(cardDir);
  const targetAbsPath = path.join(parentDir, `${folderName}.md`);
  if (fs.existsSync(targetAbsPath)) {
    console.warn(`  警告：資料夾只剩這張卡片，但攤平後的檔名已存在，維持原樣：${targetAbsPath}`);
    return null;
  }

  fs.renameSync(absPath, targetAbsPath);
  fs.rmdirSync(cardDir);
  return targetAbsPath;
}

// push 成功之後，把 Notion 頁面網址寫回卡片 frontmatter 的 notion_url 欄位。用字串手動插入
// 而不是 gray-matter 重新 stringify 整個 frontmatter，是為了不動到其他欄位既有的格式
// （例如 tags 的單行陣列寫法），只精準加/更新這一行。
function writeNotionUrlToFrontmatter(absPath, notionUrl) {
  const raw = fs.readFileSync(absPath, 'utf8');
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmMatch) {
    // 少數舊卡片是在有 frontmatter 慣例之前建的，沒有 --- 區塊可以插入，這裡不硬塞、
    // 只提醒一聲，避免每次 push 成功卻靜默漏掉 notion_url 沒人發現。
    console.warn(`  警告：${absPath} 沒有 frontmatter，notion_url 沒寫進去，建議手動補上 frontmatter 再重新 push。`);
    return raw;
  }

  const fmBody = fmMatch[1];
  const rest = raw.slice(fmMatch[0].length);
  const newFmBody = /^notion_url:/m.test(fmBody)
    ? fmBody.replace(/^notion_url:.*$/m, `notion_url: ${notionUrl}`)
    : `${fmBody}\nnotion_url: ${notionUrl}`;

  const newRaw = `---\n${newFmBody}\n---\n${rest}`;
  fs.writeFileSync(absPath, newRaw);
  return newRaw;
}

async function ensureStructure(notion, state) {
  if (!state._structurePages) state._structurePages = {};

  const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
  for (const title of STRUCTURE_PAGE_TITLES) {
    if (state._structurePages[title]) continue;
    if (!parentPageId) {
      throw new Error(`結構頁面「${title}」尚未建立，請設定 NOTION_PARENT_PAGE_ID 環境變數（已分享給 integration 的空白 page）。`);
    }
    const page = await notion.pages.create({
      parent: { type: 'page_id', page_id: parentPageId },
      properties: { title: { title: [{ text: { content: title } }] } },
    });
    state._structurePages[title] = page.id;
    console.log(`已建立結構頁面：${title}（${page.id}）`);
  }
  return state._structurePages;
}

async function ensureDataSource(notion, state) {
  if (state._dataSourceId) return state._dataSourceId;

  const structure = await ensureStructure(notion, state);
  const inboxPageId = structure['Inbox'];

  const db = await notion.databases.create({
    parent: { type: 'page_id', page_id: inboxPageId },
    title: [{ type: 'text', text: { content: DATABASE_TITLE } }],
    initial_data_source: {
      properties: {
        Title: { title: {} },
        Date: { date: {} },
        Type: { select: { options: [{ name: DEFAULT_TYPE }, { name: '文獻筆記' }, { name: '永久筆記' }] } },
        Tags: { multi_select: {} },
        RepoPath: { rich_text: {} },
        LastSyncedHash: { rich_text: {} },
      },
    },
  });

  state._databaseId = db.id;
  state._dataSourceId = db.data_sources[0].id;
  console.log(`已在 Notion 建立資料庫「${DATABASE_TITLE}」（database: ${db.id}），之後不用再帶 NOTION_PARENT_PAGE_ID。`);
  return state._dataSourceId;
}

// Notion 的 Date 屬性代表「這筆最後同步到 Notion 的時間」，不是卡片 frontmatter 的 date
// （那個是卡片自己記錄的建立日期，還在 body 之外單獨存在，push/pull 都不會動它）。
function buildProperties(card, { relPath, hash, updatedAt }) {
  return {
    Title: { title: [{ text: { content: card.title } }] },
    Type: { select: { name: card.type } },
    Tags: { multi_select: (card.tags || []).map((name) => ({ name })) },
    RepoPath: { rich_text: [{ text: { content: relPath } }] },
    LastSyncedHash: { rich_text: [{ text: { content: hash } }] },
    Date: { date: { start: updatedAt } },
  };
}

async function appendBlocksInChunks(notion, pageId, blocks) {
  // Notion API 一次 append 上限 100 個 block，卡片內容通常不會超過，但保守起見還是分批。
  for (let i = 0; i < blocks.length; i += 100) {
    await notion.blocks.children.append({ block_id: pageId, children: blocks.slice(i, i + 100) });
  }
}

async function replacePageContent(notion, pageId, blocks) {
  // Notion API 沒有「整批替換 children」的操作，要先列出既有 blocks 全部刪除，再 append 新的。
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

async function push(notion, state, { force = false } = {}) {
  const dataSourceId = await ensureDataSource(notion, state);
  const cards = listCards();
  const seen = new Set();

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let archived = 0;
  let imagesUploaded = 0;

  for (const { relPath, absPath } of cards) {
    seen.add(relPath);
    const card = parseCard(absPath);
    const hash = contentHash(card);
    const existing = state[relPath];

    if (!force && existing && existing.hash === hash) {
      skipped++;
      continue;
    }

    const cardDir = path.dirname(absPath);
    const cachedImages = (existing && existing.images) || {};
    const { body: bodyForBlocks, images, uploadedLocalPaths, placeholderById } =
      await extractLocalImages(notion, card.body, cardDir, cachedImages);

    const blocks = resolvePlaceholderImages(markdownToBlocks(bodyForBlocks || ' '), placeholderById);
    const updatedAt = new Date().toISOString();

    let pageId;
    if (!existing) {
      const page = await notion.pages.create({
        parent: { type: 'data_source_id', data_source_id: dataSourceId },
        properties: buildProperties(card, { relPath, hash, updatedAt }),
        children: blocks.slice(0, 100),
      });
      if (blocks.length > 100) await appendBlocksInChunks(notion, page.id, blocks.slice(100));
      pageId = page.id;
      created++;
    } else {
      await notion.pages.update({ page_id: existing.pageId, properties: buildProperties(card, { relPath, hash, updatedAt }) });
      await replacePageContent(notion, existing.pageId, blocks);
      pageId = existing.pageId;
      updated++;
    }

    // push 成功了才刪本地圖片、寫回 notion_url，避免中途失敗留下「本地圖片沒了但 Notion 也沒收到」的空隙。
    for (const absImagePath of uploadedLocalPaths) {
      fs.unlinkSync(absImagePath);
      imagesUploaded++;
    }

    let finalRelPath = relPath;
    let finalAbsPath = absPath;
    if (cardDir !== INBOX_DIR) {
      const flattenedAbsPath = flattenSingleCardFolder(cardDir, absPath);
      if (flattenedAbsPath) {
        finalAbsPath = flattenedAbsPath;
        finalRelPath = path.relative(ZETTEL_ROOT, flattenedAbsPath).split(path.sep).join('/');
        console.log(`  資料夾只剩這張卡片，已攤平：${relPath} -> ${finalRelPath}`);
      }
    }

    const notionUrl = `https://www.notion.so/${pageId.replace(/-/g, '')}`;
    const newRaw = writeNotionUrlToFrontmatter(finalAbsPath, notionUrl) || card.raw;

    if (finalRelPath !== relPath) {
      // RepoPath 也要跟著更新，不然 Notion 上那個屬性會指向一個已經不存在的舊路徑。
      await notion.pages.update({ page_id: pageId, properties: { RepoPath: { rich_text: [{ text: { content: finalRelPath } }] } } });
      delete state[relPath];
      seen.add(finalRelPath);
    }

    state[finalRelPath] = {
      pageId,
      hash,
      content: newRaw,
      images,
      direction: existing ? existing.direction : 'push',
      updatedAt,
    };
  }

  // 卡片從 repo 消失（被刪除或搬走）-> 封存對應的 Notion page。
  // 只清 push 建立的：pull 建立的 page 是 Notion 原生內容，本地檔案被刪不代表 Notion 那邊也要清掉。
  const metaKeys = new Set(['_databaseId', '_dataSourceId', '_structurePages']);
  for (const relPath of Object.keys(state)) {
    if (metaKeys.has(relPath) || seen.has(relPath)) continue;
    if (state[relPath].direction !== 'push') continue;
    try {
      await notion.pages.update({ page_id: state[relPath].pageId, archived: true });
    } catch (e) {
      // page 可能已經被手動刪除，略過即可
    }
    delete state[relPath];
    archived++;
  }

  writeJSON(STATE_PATH, state);
  console.log(`push 完成：新增 ${created} 筆、更新 ${updated} 筆、略過 ${skipped} 筆（未變動）、封存 ${archived} 筆、上傳並刪除本地圖片 ${imagesUploaded} 張。`);
}

function propText(prop) {
  if (!prop) return '';
  if (prop.type === 'title') return prop.title.map((t) => t.plain_text).join('');
  if (prop.type === 'rich_text') return prop.rich_text.map((t) => t.plain_text).join('');
  return '';
}

async function pull(notion, state) {
  const dataSourceId = state._dataSourceId;
  if (!dataSourceId) {
    throw new Error('資料庫還不存在，請先跑過一次 push（會自動建立資料庫）。');
  }

  const metaKeys = new Set(['_databaseId', '_dataSourceId', '_structurePages']);
  const knownPageIds = new Set(
    Object.keys(state)
      .filter((k) => !metaKeys.has(k))
      .map((k) => state[k].pageId)
  );

  const n2m = new NotionToMarkdown({ notionClient: notion });

  let cursor;
  const pages = [];
  do {
    const res = await notion.dataSources.query({ data_source_id: dataSourceId, start_cursor: cursor });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  let pulled = 0;
  let skipped = 0;

  for (const page of pages) {
    if (page.archived || page.in_trash) continue;
    if (knownPageIds.has(page.id)) {
      skipped++;
      continue;
    }

    const props = page.properties;
    const title = propText(props.Title) || '未命名';
    const date = props.Date && props.Date.date ? props.Date.date.start : null;
    const type = props.Type && props.Type.select ? props.Type.select.name : DEFAULT_TYPE;
    const tags = props.Tags && props.Tags.multi_select ? props.Tags.multi_select.map((t) => t.name) : [];

    const mdBlocks = await n2m.pageToMarkdown(page.id);
    const { parent: body } = n2m.toMarkdownString(mdBlocks);

    let relPath = `01-Inbox/${sanitizeFilename(title)}.md`;
    let absPath = path.join(ZETTEL_ROOT, relPath);
    let suffix = 2;
    while (fs.existsSync(absPath)) {
      relPath = `01-Inbox/${sanitizeFilename(title)}-${suffix}.md`;
      absPath = path.join(ZETTEL_ROOT, relPath);
      suffix++;
    }

    const frontmatter = [
      '---',
      `title: ${title}`,
      `date: ${date || ''}`,
      `type: ${type}`,
      `tags: [${tags.join(', ')}]`,
      '---',
      '',
    ].join('\n');
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, frontmatter + (body || '').trim() + '\n');

    const card = parseCard(absPath);
    const hash = contentHash(card);
    const updatedAt = new Date().toISOString();
    await notion.pages.update({ page_id: page.id, properties: buildProperties(card, { relPath, hash, updatedAt }) });
    state[relPath] = { pageId: page.id, hash, content: card.raw, direction: 'pull', updatedAt };
    pulled++;
  }

  writeJSON(STATE_PATH, state);
  console.log(`pull 完成：新增 ${pulled} 筆 repo 卡片、略過 ${skipped} 筆（已同步過）。`);
}

// 純本地比對，不用打 Notion API、不用 token：像 `git status` 一樣先看有哪些卡片
// 還沒上傳、哪些內容變了要重傳，決定要不要真的跑 push。
function status(state) {
  const cards = listCards();
  const seen = new Set();
  const rows = { new: [], changed: [], unchanged: [], removed: [] };

  for (const { relPath, absPath } of cards) {
    seen.add(relPath);
    const hash = contentHash(parseCard(absPath));
    const existing = state[relPath];
    if (!existing) rows.new.push(relPath);
    else if (existing.hash !== hash) rows.changed.push(relPath);
    else rows.unchanged.push(relPath);
  }

  const metaKeys = new Set(['_databaseId', '_dataSourceId', '_structurePages']);
  for (const relPath of Object.keys(state)) {
    if (metaKeys.has(relPath) || seen.has(relPath)) continue;
    if (state[relPath].direction === 'push') rows.removed.push(relPath);
  }

  const print = (label, list) => {
    console.log(`\n${label}（${list.length}）`);
    for (const r of list) console.log(`  - ${r}`);
  };
  print('新增，還沒上傳到 Notion', rows.new);
  print('已上傳過，但內容變了（push 會更新）', rows.changed);
  print('已同步、沒有變動', rows.unchanged);
  print('Notion 上有、repo 端已刪除（push 會封存）', rows.removed);
}

// 像 `git diff` 一樣，把「上次同步到 Notion 時的內容」跟「現在的內容」做逐行比對。
// 比對基準是 state file 裡存的 content 快照，不是 git 的 commit 歷史——所以就算這個檔案
// 從沒 commit 過，只要上次 push/pull 過一次，這裡都能算出真正的差異。
function printDiff(oldText, newText) {
  const changes = diffLines(oldText || '', newText || '');
  for (const part of changes) {
    const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
    const lines = part.value.replace(/\n$/, '').split('\n');
    for (const line of lines) console.log(prefix + line);
  }
}

function diffCommand(state) {
  const cards = listCards();
  let any = false;

  for (const { relPath, absPath } of cards) {
    const card = parseCard(absPath);
    const hash = contentHash(card);
    const existing = state[relPath];

    if (!existing) {
      console.log(`\n=== ${relPath}（新增，還沒上傳過，沒有比對基準，push 會整篇上傳）===`);
      any = true;
      continue;
    }
    if (existing.hash === hash) continue;

    any = true;
    console.log(`\n=== ${relPath} ===`);
    if (existing.content === undefined) {
      console.log('（這張卡片是升級 diff 功能前同步的，還沒有存內容快照，先跑一次 push 之後下次改動才能看到逐行差異）');
    } else {
      printDiff(existing.content, card.raw);
    }
  }

  if (!any) console.log('目前沒有異動或新增的卡片。');
}

async function main() {
  const mode = process.argv[2];
  const force = process.argv.includes('--force');
  if (!['push', 'pull', 'status', 'diff'].includes(mode)) {
    console.error('Usage: node sync_notion.js <push|pull|status|diff> [--force]');
    process.exit(1);
  }

  const state = readJSON(STATE_PATH, {});

  if (mode === 'status') {
    status(state);
    return;
  }
  if (mode === 'diff') {
    diffCommand(state);
    return;
  }

  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    console.error('請設定 NOTION_API_KEY 環境變數（Notion internal integration 的 token）。');
    process.exit(1);
  }

  const notion = new Client({ auth: apiKey });

  if (mode === 'push') {
    await push(notion, state, { force });
  } else {
    await pull(notion, state);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('sub-notion-sync 執行失敗：', (err && err.body) || (err && err.message) || err);
    process.exit(1);
  });
}

module.exports = { listCards, parseCard, contentHash, sanitizeFilename, buildProperties };
