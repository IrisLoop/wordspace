import { extractWords } from './core.mjs';
import { createOCR } from './ocr.mjs?v=2.2.0';
import { PDF_BUILD_PATH, pdfPageText, needsPageOCR, normalizeImportText } from './import-utils.mjs';
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
export async function parseText(text, skipCommon, uncertainWords = []) {
  const words = extractWords(normalizeImportText(text), skipCommon), uncertain = new Set(uncertainWords);
  if(words.length > 3000) throw new Error('本次识别超过 3,000 个单词，请把材料分成几个批次导入。');
  return Promise.all(words.map(async word => ({ word, ...await lookup(word), selected: true, uncertain:uncertain.has(word) })));
}
let mammothPromise;
async function getMammoth() {
  if(!mammothPromise) mammothPromise = new Promise((resolve,reject) => { const s=document.createElement('script');s.src=resource('vendor/mammoth/mammoth.browser.min.js');s.onload=()=>resolve(window.mammoth);s.onerror=()=>{mammothPromise=null;reject(new Error('无法加载 Word 解析器'));};document.head.append(s); });
  return mammothPromise;
}
export async function readFiles(files, progress, options = {}) {
  if(files.length > 20) throw new Error('每次最多选择 20 个文件。');
  const output = [], uncertain = new Set(), notes = [], ocr = createOCR(options);
  let ocrUsed = false;
  const recognize = async (input, report) => {
    ocrUsed = true;
    const result = await ocr.recognize(input, report);
    result.uncertain.forEach(word => uncertain.add(word));
    return result.text;
  };
  try {
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
      // Both main and worker must use the legacy build: the worker also needs
      // Uint8Array.toHex / Promise.withResolvers compatibility on older phones.
      const pdfjs=await import(resource(`${PDF_BUILD_PATH}pdf.mjs`)); pdfjs.GlobalWorkerOptions.workerSrc=resource(`${PDF_BUILD_PATH}pdf.worker.mjs`);
      const task=pdfjs.getDocument({ data:await file.arrayBuffer(), cMapUrl:resource('vendor/pdfjs-dist/cmaps/'), cMapPacked:true, standardFontDataUrl:resource('vendor/pdfjs-dist/standard_fonts/'), wasmUrl:resource('vendor/pdfjs-dist/wasm/') });
      try {
        const doc=await task.promise;
        if(doc.numPages>100) throw new Error('PDF 超过 100 页，请按章节拆分。');
        for(let p=1;p<=doc.numPages;p++) {
          report(`解析 PDF 第 ${p}/${doc.numPages} 页`);
          const page=await doc.getPage(p);
          try {
            const content=await page.getTextContent();
            let text=pdfPageText(content.items), hasImages=false;
            if(options.pdfMode!=='scan' && extractWords(text).length<50) {
              const ops=await page.getOperatorList();
              const imageOps=new Set([pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject,pdfjs.OPS.paintImageMaskXObject]);
              hasImages=ops.fnArray.some(op=>imageOps.has(op));
            }
            if(options.pdfMode==='scan' || needsPageOCR(text,hasImages)) {
              const native=page.getViewport({scale:1});
              const scale=Math.min(3,Math.sqrt(4000000/(native.width*native.height)),3200/Math.max(native.width,native.height));
              const viewport=page.getViewport({scale}); const canvas=document.createElement('canvas');
              canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
              try {
                await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'}).promise;
                const scanned=await recognize(canvas,s=>report(`第 ${p}/${doc.numPages} 页 · ${s}`));
                text=options.pdfMode==='scan'?scanned:`${text}\n${scanned}`;
                if(!scanned.trim()) notes.push(`${file.name} 第 ${p} 页没有识别到文字，请对照原件检查。`);
              } finally {canvas.width=0;canvas.height=0;}
            }
            output.push(text);
          } finally {page.cleanup();}
        }
      } catch(error) {
        if(error.name==='PasswordException') throw new Error(`${file.name} 需要密码，请先解锁 PDF 再导入。`);
        if(error.name==='InvalidPDFException') throw new Error(`${file.name} 不是完整的 PDF，请重新下载或导出后再试。`);
        if(error instanceof TypeError) throw new Error('PDF 解析组件加载失败，请刷新页面获取新版后重试。', {cause:error});
        throw error;
      } finally {await task.destroy();}
    } else throw new Error(`暂不支持 .${ext} 文件。请使用图片、PDF、DOCX 或文本文件。`);
  }
  progress('文件解析完成，正在匹配中文释义…',95);
  return { text:output.join('\n'), uncertain:[...uncertain], notes, ocrUsed };
  } finally {await ocr.close();}
}
