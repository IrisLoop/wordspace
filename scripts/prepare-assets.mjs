import { mkdir, writeFile, readFile, copyFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { parse } from 'csv-parse';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const assets = path.join(root, 'public/assets');
await mkdir(path.join(assets, 'dictionary'), { recursive: true });
await mkdir(path.join(assets, 'ocr'), { recursive: true });
await mkdir(path.join(root, 'licenses'), { recursive: true });
await mkdir(path.join(root, 'runtime'), { recursive: true });
async function download(url, dest) {
  try { if((await stat(dest)).size > 100) return; } catch {}
  console.log('Downloading', path.basename(dest));
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if(!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  await writeFile(dest, Buffer.from(await response.arrayBuffer()));
}
const csvSource = path.join(root, 'node_modules/ecdict/assets/ecdict.csv');
await copyFile(path.join(root, 'node_modules/ecdict/LICENSE'), path.join(root, 'licenses/ecdict-package.txt'));
await import('./prepare-ocr.mjs');
const buckets = Object.fromEntries('abcdefghijklmnopqrstuvwxyz'.split('').map(c => [c, {}]));
let count = 0;
for await (const row of createReadStream(csvSource).pipe(parse({ columns: true, bom: true, relax_quotes: true }))) {
  const key = row.word?.trim().toLowerCase();
  if(!key || !/^[a-z]+(?:['-][a-z]+)*$/.test(key) || key.length > 48 || !row.translation?.trim()) continue;
  const lines = row.translation.split(/\\n|\n/).map(s => s.trim()).filter(Boolean);
  const general = lines.filter(s => !s.startsWith('['));
  const meaning = (general.length ? general : lines).slice(0, 2).join('；').slice(0, 180);
  if(!Object.hasOwn(buckets[key[0]], key)) { buckets[key[0]][key] = [meaning, row.phonetic || '']; count++; }
}
await Promise.all(Object.entries(buckets).map(([letter, data]) => writeFile(path.join(assets, `dictionary/${letter}.json`), JSON.stringify(data))));
await writeFile(path.join(assets, 'dictionary/meta.json'), JSON.stringify({ count, source: 'ECDICT', url: 'https://github.com/skywind3000/ECDICT' }));
await copyFile(process.execPath, path.join(root, 'runtime/node.exe'));
console.log(`Prepared ${count} dictionary entries and local OCR model.`);
