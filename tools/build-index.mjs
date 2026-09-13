import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const web = path.join(root, 'web');
const novelsRoot = path.join(web, 'novel');
const indexPath = path.join(web, 'novel-index.json');
const checkOnly = process.argv.includes('--check');
const errors = [], warnings = [];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const posix = (value) => value.split(path.sep).join('/');
const actPattern = /^(\d{3,})_(.+?)_(.+)$/;
const chapterPattern = /^(\d{3,})_(.+?)(?:_(.+))?\.md$/i;
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function issue(type, file, message) { (type === 'error' ? errors : warnings).push(`${posix(path.relative(root, file))}: ${message}`); }
function titleFrom(name, isChapter = false) {
  const match = (isChapter ? chapterPattern : actPattern).exec(name);
  if (!match) return null;
  return match[3] ? `${match[2]}：${match[3]}` : match[2];
}
function imageSize(buffer, ext) {
  if (ext === '.png' && buffer.toString('ascii', 1, 4) === 'PNG') return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (ext === '.gif') return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  if (ext === '.jpg' || ext === '.jpeg') {
    for (let i = 2; i < buffer.length - 9;) {
      if (buffer[i] !== 0xff) { i++; continue; }
      const marker = buffer[i + 1], length = buffer.readUInt16BE(i + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) };
      i += 2 + length;
    }
  }
  return null;
}
function wordCount(markdown) {
  const plain = markdown.replace(/^#{1,6}\s.*$/gm, '').replace(/```[\s\S]*?```/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, '');
  return [...plain].filter((char) => /[\p{L}\p{N}]/u.test(char)).length;
}
async function collectImages(dir, allAssets) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectImages(full, allAssets);
    else if (imageExtensions.has(path.extname(entry.name).toLowerCase())) {
      const bytes = await readFile(full), size = imageSize(bytes, path.extname(entry.name).toLowerCase());
      if (!size?.width || !size?.height) issue('error', full, '無法讀取圖片尺寸。');
      else allAssets.set(posix(path.relative(web, full)), { path: posix(path.relative(web, full)), version: hash(bytes), ...size });
    }
  }
}
async function main() {
  if (!existsSync(novelsRoot)) { issue('error', novelsRoot, '找不到 novel 目錄。'); return finish(); }
  const assets = new Map(), novels = [], ids = new Set();
  for (const novelEntry of await readdir(novelsRoot, { withFileTypes: true })) {
    if (!novelEntry.isDirectory()) continue;
    const novelDir = path.join(novelsRoot, novelEntry.name), metaPath = path.join(novelDir, 'meta.json');
    if (!existsSync(metaPath)) { issue('error', novelDir, '缺少 meta.json。'); continue; }
    let meta;
    try { meta = JSON.parse(await readFile(metaPath, 'utf8')); } catch { issue('error', metaPath, '不是有效的 JSON。'); continue; }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.id || '')) issue('error', metaPath, 'id 必須是小寫字母、數字與連字號。');
    else if (ids.has(meta.id)) issue('error', metaPath, `重複的小說 id：${meta.id}`); else ids.add(meta.id);
    if (meta.aliases !== undefined && (!Array.isArray(meta.aliases) || meta.aliases.some((v) => typeof v !== 'string'))) issue('error', metaPath, 'aliases 必須是字串陣列。');
    await collectImages(novelDir, assets);
    const acts = [];
    for (const actEntry of await readdir(novelDir, { withFileTypes: true })) {
      if (!actEntry.isDirectory() || !actPattern.test(actEntry.name)) continue;
      const actDir = path.join(novelDir, actEntry.name), chapters = [], orders = new Set();
      for (const chapterEntry of await readdir(actDir, { withFileTypes: true })) {
        if (!chapterEntry.isFile() || !chapterPattern.test(chapterEntry.name)) continue;
        const match = chapterPattern.exec(chapterEntry.name), order = match[1];
        if (orders.has(order)) issue('error', actDir, `重複的章節排序序號：${order}`); else orders.add(order);
        const chapterPath = path.join(actDir, chapterEntry.name), markdown = await readFile(chapterPath, 'utf8');
        chapters.push({ id: posix(path.relative(novelDir, chapterPath)), title: titleFrom(chapterEntry.name, true), path: posix(path.relative(web, chapterPath)), version: hash(markdown), wordCount: wordCount(markdown), _order: Number(order) });
      }
      chapters.sort((a, b) => a._order - b._order); chapters.forEach((chapter) => delete chapter._order);
      if (chapters.length) acts.push({ title: titleFrom(actEntry.name), chapters, _order: Number(actPattern.exec(actEntry.name)[1]) });
      else issue('warning', actDir, '空幕不會列入閱讀目錄。');
    }
    acts.sort((a, b) => a._order - b._order); acts.forEach((act) => delete act._order);
    const cover = typeof meta.cover === 'string' && meta.cover ? posix(path.join('novel', novelEntry.name, meta.cover)) : '';
    if (cover && !assets.has(cover)) issue('error', metaPath, `找不到封面：${meta.cover}`);
    const chapterCount = acts.reduce((sum, act) => sum + act.chapters.length, 0);
    const totalWords = acts.flatMap((act) => act.chapters).reduce((sum, chapter) => sum + chapter.wordCount, 0);
    novels.push({ id: meta.id || '', title: novelEntry.name, author: typeof meta.author === 'string' ? meta.author : '', aliases: Array.isArray(meta.aliases) ? meta.aliases : [], description: typeof meta.description === 'string' ? meta.description : '', cover, chapterCount, wordCount: totalWords, acts });
  }
  novels.sort((a, b) => a.id.localeCompare(b.id));
  const result = { schemaVersion: 1, contentVersion: '', assets: [...assets.values()].sort((a, b) => a.path.localeCompare(b.path)), novels };
  result.contentVersion = hash(JSON.stringify(result));
  if (!errors.length && !checkOnly) { const temp = `${indexPath}.tmp`; writeFileSync(temp, `${JSON.stringify(result, null, 2)}\n`, 'utf8'); renameSync(temp, indexPath); console.log(`已產生 ${posix(path.relative(root, indexPath))}（${novels.length} 本小說）。`); }
  if (!errors.length && checkOnly) console.log(`驗證通過：${novels.length} 本小說。`);
  finish();
}
function finish() { for (const warning of warnings) console.warn(`警告：${warning}`); for (const error of errors) console.error(`錯誤：${error}`); process.exitCode = errors.length ? 1 : 0; }
await main();
