#!/usr/bin/env node
'use strict';

/**
 * 互動式在 02-zettelkasten/01-Inbox/ 底下建立一張新卡片（Inbox 概念：新筆記先進 Inbox，
 * 之後再批次分類到 Atlas/Calendar/Card/Extra/Source/Space），依序問：
 *   1. 標題（打字）
 *   2. 筆記類型（下拉：靈感筆記/文獻筆記/永久筆記）
 *   3. tag（下拉勾選既有 tag，或選「+ 新增 tag」自己打新的）
 *
 * Usage: node 02-zettelkasten/00-Scirpt/new-card.js
 */

const fs = require('fs');
const path = require('path');
const prompts = require('prompts');

const ZETTEL_ROOT = path.resolve(__dirname, '..');
const INBOX_DIR = path.join(ZETTEL_ROOT, '01-Inbox');
const NEW_TAG_VALUE = '__new_tag__';

const TYPE_CHOICES = [
  { title: '靈感筆記（初步捕捉的想法）', value: '靈感筆記' },
  { title: '文獻筆記（整理自外部來源）', value: '文獻筆記' },
  { title: '永久筆記（自己消化過的定型知識）', value: '永久筆記' },
];

function scanExistingTags() {
  const tags = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '00-Scirpt' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const content = fs.readFileSync(full, 'utf8');
        const match = content.match(/^tags:\s*\[(.*)\]\s*$/m);
        if (match) {
          match[1]
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
            .forEach((tag) => tags.add(tag));
        }
      }
    }
  };
  walk(ZETTEL_ROOT);
  return [...tags].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

function todayLocalDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function main() {
  const { title } = await prompts({
    type: 'text',
    name: 'title',
    message: '卡片標題',
    validate: (value) => (value.trim() ? true : '標題不能空白'),
  });
  if (!title) return console.log('已取消。');

  const { type } = await prompts({
    type: 'select',
    name: 'type',
    message: '筆記類型',
    choices: TYPE_CHOICES,
  });
  if (!type) return console.log('已取消。');

  const existingTags = scanExistingTags();
  const { selectedTags } = await prompts({
    type: 'multiselect',
    name: 'selectedTags',
    message: '選 tag（空白鍵勾選，Enter 確認；沒有想要的就直接選「+ 新增 tag」）',
    choices: [
      ...existingTags.map((tag) => ({ title: tag, value: tag })),
      { title: '+ 新增 tag', value: NEW_TAG_VALUE },
    ],
    instructions: false,
  });
  if (selectedTags === undefined) return console.log('已取消。');

  const tags = selectedTags.filter((tag) => tag !== NEW_TAG_VALUE);
  if (selectedTags.includes(NEW_TAG_VALUE)) {
    const { newTags } = await prompts({
      type: 'text',
      name: 'newTags',
      message: '輸入新 tag（多個用逗號分隔）',
    });
    if (newTags) {
      tags.push(...newTags.split(',').map((tag) => tag.trim()).filter(Boolean));
    }
  }

  const trimmedTitle = title.trim();
  const targetFile = path.join(INBOX_DIR, `${trimmedTitle}.md`);
  if (fs.existsSync(targetFile)) {
    const { overwrite } = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: `檔案已存在：${targetFile}，要覆蓋嗎？`,
      initial: false,
    });
    if (!overwrite) return console.log('已取消。');
  }

  const content = [
    '---',
    `title: ${trimmedTitle}`,
    `date: ${todayLocalDate()}`,
    `type: ${type}`,
    `tags: [${tags.join(', ')}]`,
    '---',
    '',
    `## ${trimmedTitle}`,
    '',
  ].join('\n');

  fs.mkdirSync(INBOX_DIR, { recursive: true });
  fs.writeFileSync(targetFile, content, 'utf8');
  console.log(`\n已建立：${targetFile}\n`);
  console.log(content);
}

main();
