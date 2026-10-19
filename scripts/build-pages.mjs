import { cp, mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs');
await mkdir(out,{recursive:true});
await cp(path.join(root,'public'),out,{recursive:true});
let html=await readFile(path.join(out,'index.html'),'utf8');
html=html.replace('<head>','<head><meta name="wordspace-storage" content="browser">');
await writeFile(path.join(out,'index.html'),html);
await writeFile(path.join(out,'.nojekyll'),'');
const files=[
 'tesseract.js/dist/tesseract.min.js','tesseract.js/dist/worker.min.js','tesseract.js/LICENSE.md',
 'mammoth/mammoth.browser.min.js','mammoth/LICENSE',
 'pdfjs-dist/legacy/build/pdf.mjs','pdfjs-dist/legacy/build/pdf.worker.mjs','pdfjs-dist/cmaps','pdfjs-dist/standard_fonts','pdfjs-dist/wasm','pdfjs-dist/LICENSE',
 'tesseract.js-core/LICENSE'
];
const cores=await readdir(path.join(root,'node_modules/tesseract.js-core'));
files.push(...cores.filter(f=>f.endsWith('.wasm')||f.endsWith('.wasm.js')).map(f=>`tesseract.js-core/${f}`));
for(const file of files){const source=path.join(root,'node_modules',file),dest=path.join(out,'vendor',file);await mkdir(path.dirname(dest),{recursive:true});await cp(source,dest,{recursive:true});}
await cp(path.join(root,'licenses'),path.join(out,'licenses'),{recursive:true});
let size=0,count=0;
async function walk(dir){for(const file of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,file.name);if(file.isDirectory())await walk(full);else{size+=(await stat(full)).size;count++;}}}
await walk(out);console.log(`Static Pages build ready: ${count} files, ${(size/1024/1024).toFixed(1)} MB. No personal data included.`);
