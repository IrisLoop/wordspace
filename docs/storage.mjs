import { validateState } from './core.mjs';
import { createBrowserStorage, reconnectOnResume } from './browser-storage.mjs?v=2.1.1';
export let storageMode = 'browser';
const base = new URL('.', import.meta.url);
const browserStore = createBrowserStorage({ name: `wordspace:${base.pathname}` });
reconnectOnResume(browserStore, window, document);
export async function loadState() {
  const forceBrowser=document.querySelector('meta[name="wordspace-storage"]')?.content==='browser';
  if(!forceBrowser && ['127.0.0.1','localhost'].includes(location.hostname)) {
    const response=await fetch(new URL('api/state',base),{signal:AbortSignal.timeout(5000)});
    if(!response.ok) throw new Error('本地词库服务不可用，请通过启动脚本打开。');
    storageMode='file';return validateState(await response.json());
  }
  return browserStore.load();
}
export async function saveState(next) {
  validateState(next);
  if(storageMode==='file') {
    const response=await fetch(new URL('api/state',base),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});
    const result=await response.json();if(!response.ok)throw new Error(result.error);
    return result.revision;
  }
  return browserStore.save(next);
}
