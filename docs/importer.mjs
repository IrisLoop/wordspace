import { extractWords } from './core.mjs';
const cache = new Map();
const resource = path => new URL(path.replace(/^\//,''), import.meta.url).href;
async function dictionary(letter) {
  if (!cache.has(letter)) cache.set(letter, fetch(resource(`assets/dictionary/${letter}.json`)).then(r => { if(!r.ok) throw new Error('离线词典未就绪，请运行资源准备脚本。'); return r.json(); }).catch(e => { cache.delete(letter); throw e; }));
  return cache.get(letter);
}
export async function lookup(word) {
  const dict = await dictionary(word[0]);
  if(Object.hasOwn(dict, word)) return { meaning: dict[word][0], phonetic: dict[word][1] };
  const candidates = [];
  if(word.endsWith("'s")) candidates.push(word.slice(0, -2));
  if(word.endsWith('ies')) candidates.push(word.slice(0, -3) + 'y');
  if(word.endsWith('s')) candidates.push(word.slice(0, -1), word.slice(0, -2));
  if(word.endsWith('ied')) candidates.push(word.slice(0, -3) + 'y');
  if(word.endsWith('ed')) candidates.push(word.slice(0, -1), word.slice(0, -2), word.slice(0, -3));
  if(word.endsWith('ing')) candidates.push(word.slice(0, -3), word.slice(0, -3) + 'e', word.slice(0, -4));
  for(const stem of candidates) if(Object.hasOwn(dict, stem)) return { meaning: `${dict[stem][0]}（原形：${stem}）`, phonetic: '' };
  return { meaning: '', phonetic: '' };
}
export async function parseText(text, skipCommon) {
  const words = extractWords(text, skipCommon);
  if(words.length > 3000) throw new Error('本次识别超过 3,000 个单词，请把材料分成几个批次导入。');
  return Promise.all(words.map(async word => ({ word, ...await lookup(word), selected: true })));
}
let ocrPromise;
let ocrLogger = () => {};
async function getOCR(progress) {
  ocrLogger = progress;
  if(!ocrPromise) ocrPromise = (async () => {
    if(!window.Tesseract) await new Promise((resolve,reject) => { const script = document.createElement('script'); script.src=resource('vendor/tesseract.js/dist/tesseract.min.js'); script.onload=resolve; script.onerror=()=>reject(new Error('无法加载本地 OCR 引擎。')); document.head.append(script); });
    return window.Tesseract.createWorker('eng', 1, { workerPath:resource('vendor/tesseract.js/dist/worker.min.js'), corePath:resource('vendor/tesseract.js-core'), langPath:resource('assets/ocr'), logger: m => ocrLogger(m.status === 'recognizing text' ? `识别图片 ${Math.round(m.progress*100)}%` : '准备本地图片识别引擎…') });
  })().catch(e=> {ocrPromise=null;throw e;});
  return ocrPromise;
}
async function recognize(input, progress) {
  const worker = await getOCR(progress);
  const result = await worker.recognize(input);
  return result.data.text;
}
let mammothPromise;
async function getMammoth() {
  if(!mammothPromise) mammothPromise = new Promise((resolve,reject) => { const s=document.createElement('script');s.src=resource('vendor/mammoth/mammoth.browser.min.js');s.onload=()=>resolve(window.mammoth);s.onerror=()=>{mammothPromise=null;reject(new Error('无法加载 Word 解析器'));};document.head.append(s); });
  return mammothPromise;
}
export async function readFiles(files, progress) {
  if(files.length > 20) throw new Error('每次最多选择 20 个文件。');
  let output = [];
  for(let i=0;i<files.length;i++) {
    const file=files[i]; const prefix=`${i+1}/${files.length} · ${file.name}`;
    const report=s=>progress(`${prefix} · ${s}`, (i/files.length)*100);
    if(file.size>30*1024*1024) throw new Error(`${file.name} 超过 30 MB，请拆分后导入。`);
    const ext=file.name.split('.').pop().toLowerCase(); report('读取中…');
    if(['png','jpg','jpeg','webp','bmp'].includes(ext)) output.push(await recognize(file,report));
    else if(['txt','md','csv','tsv'].includes(ext)) {
      const bytes=await file.arrayBuffer(); let text;
      try { text=new TextDecoder('utf-8',{fatal:true}).decode(bytes); } catch { text=new TextDecoder('gb18030').decode(bytes); }
      output.push(text);
    } else if(ext==='docx') {
      const mammoth=await getMammoth(); const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()}); output.push(result.value);
    } else if(ext==='pdf') {
      const pdfjs=await import(resource('vendor/pdfjs-dist/build/pdf.mjs')); pdfjs.GlobalWorkerOptions.workerSrc=resource('vendor/pdfjs-dist/build/pdf.worker.mjs');
      const doc=await pdfjs.getDocument({ data:await file.arrayBuffer(), cMapUrl:resource('vendor/pdfjs-dist/cmaps/'), cMapPacked:true, standardFontDataUrl:resource('vendor/pdfjs-dist/standard_fonts/'), wasmUrl:resource('vendor/pdfjs-dist/wasm/') }).promise;
      try {
        if(doc.numPages>100) throw new Error('PDF 超过 100 页，请按章节拆分。');
        for(let p=1;p<=doc.numPages;p++) {
          report(`解析 PDF 第 ${p}/${doc.numPages} 页`);
          const page=await doc.getPage(p); const content=await page.getTextContent();
          let text=content.items.map(item=>item.str + (item.hasEOL?'\n':' ')).join('');
          if(!/[a-zA-Z]{2}/.test(text)) {
            const viewport=page.getViewport({scale:2}); const canvas=document.createElement('canvas');
            canvas.width=viewport.width;canvas.height=viewport.height;
            await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
            text=await recognize(canvas,s=>report(`第 ${p} 页 · ${s}`)); canvas.width=0;canvas.height=0;
          }
          output.push(text);page.cleanup();
        }
      } finally {await doc.destroy();}
    } else throw new Error(`暂不支持 .${ext} 文件。请使用图片、PDF、DOCX 或文本文件。`);
  }
  progress('文件解析完成，正在匹配中文释义…',95);
  return output.join('\n');
}
