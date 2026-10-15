import { emptyState, validateState } from './core.mjs';
let database;
export let storageMode = 'browser';
const base = new URL('.', import.meta.url);
function openDatabase() {
  if(!database) database = new Promise((resolve,reject)=>{
    const request=indexedDB.open(`wordspace:${base.pathname}`,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('state');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error('无法打开浏览器词库，请允许此网站保存数据。'));
  });
  return database;
}
export async function loadState() {
  const forceBrowser=document.querySelector('meta[name="wordspace-storage"]')?.content==='browser';
  if(!forceBrowser && ['127.0.0.1','localhost'].includes(location.hostname)) {
    const response=await fetch(new URL('api/state',base),{signal:AbortSignal.timeout(5000)});
    if(!response.ok) throw new Error('本地词库服务不可用，请通过启动脚本打开。');
    storageMode='file';return validateState(await response.json());
  }
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const request=db.transaction('state','readonly').objectStore('state').get('current');
    request.onsuccess=()=>{try{resolve(request.result?validateState(request.result):emptyState());}catch(e){reject(e);}};
    request.onerror=()=>reject(new Error('读取浏览器词库失败，请重试。'));
  });
}
export async function saveState(next) {
  validateState(next);
  if(storageMode==='file') {
    const response=await fetch(new URL('api/state',base),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});
    const result=await response.json();if(!response.ok)throw new Error(result.error);
    return result.revision;
  }
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('state','readwrite'),store=tx.objectStore('state');let failure;
    const request=store.get('current');
    request.onsuccess=()=>{
      const current=request.result||emptyState();
      if(current.revision!==next.revision){failure=new Error('另一个窗口已修改词库，请刷新页面后重试。');tx.abort();return;}
      store.put(current,'previous');store.put({...next,revision:next.revision+1},'current');
    };
    tx.oncomplete=()=>resolve(next.revision+1);
    tx.onabort=()=>reject(failure||new Error('浏览器保存失败或空间不足，请先导出备份。'));
    tx.onerror=()=>{};
  });
}
