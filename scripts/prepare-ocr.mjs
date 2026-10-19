import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const revision = 'e12c65a915945e4c28e237a9b52bc4a8f39a0cec';
const source = `https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/${revision}`;
const folder = path.join(root, 'public/assets/ocr/best-v1');
await mkdir(folder, { recursive:true });
const models = [];
for (const language of ['eng', 'chi_sim']) {
  const url = `${source}/${language}.traineddata`;
  const response = await fetch(`https://api.github.com/repos/tesseract-ocr/tessdata_best/contents/${language}.traineddata?ref=${revision}`, { headers:{Accept:'application/vnd.github.raw+json'}, signal:AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`OCR model download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1000000) throw new Error('OCR model is unexpectedly small');
  const compressed = gzipSync(bytes, { level:9 });
  await writeFile(path.join(folder, `${language}.traineddata.gz`), compressed);
  models.push({ language, url, bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(path.join(folder, 'manifest.json'), JSON.stringify({ source:'tesseract-ocr/tessdata_best', revision, license:'Apache-2.0', models }, null, 2)+'\n');
await mkdir(path.join(root, 'licenses'), { recursive:true });
// tessdata_best distributes its models under the same Apache 2.0 license.
const license = await readFile(path.join(root, 'node_modules/tesseract.js-core/LICENSE'), 'utf8');
await writeFile(path.join(root, 'licenses/tessdata-best.txt'), `Tesseract tessdata_best (English and Simplified Chinese models)\nhttps://github.com/tesseract-ocr/tessdata_best\nRevision: ${revision}\n\n${license}`);
console.log('Prepared official tessdata_best English and Chinese models.');
