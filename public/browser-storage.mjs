import { emptyState, validateState } from './core.mjs';

const transientErrors = new Set(['InvalidStateError', 'UnknownError', 'AbortError']);
const recoveryMessage = '浏览器词库连接暂时中断，请再试一次；若仍失败，请退出并重新打开 Safari。不要清除网站数据。';

// Keep the database name/version unchanged: reconnect to the existing library.
export function createBrowserStorage({ indexedDB = globalThis.indexedDB, name, timeoutMs = 8000, retryDelays = [120, 300] }) {
  let connection, opening;

  function release(db = connection) {
    if (!db) return;
    if (connection === db) connection = undefined;
    db.close(); // Already-running transactions can finish before the close.
  }

  function open() {
    if (connection) return Promise.resolve(connection);
    if (opening) return opening;
    const pending = new Promise((resolve, reject) => {
      let settled = false, blocked = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(new Error(blocked ? '词库正在被其他页面使用，请关闭其他词间标签页后重试。' : recoveryMessage));
      }, timeoutMs);
      const fail = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      };
      try {
        if (!indexedDB) throw new Error('此浏览器暂时无法使用本地词库，请允许网站保存数据后重试。');
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
          if (settled) { request.transaction.abort(); return; }
          if (!request.result.objectStoreNames.contains('state')) request.result.createObjectStore('state');
        };
        request.onblocked = () => { blocked = true; };
        request.onerror = () => fail(request.error);
        request.onsuccess = () => {
          const db = request.result;
          // An open request cannot be cancelled; dispose of a late connection.
          if (settled) { db.close(); return; }
          settled = true;
          clearTimeout(timer);
          connection = db;
          db.onclose = () => { if (connection === db) connection = undefined; };
          db.onversionchange = () => release(db);
          resolve(db);
        };
      } catch (error) { fail(error); }
    });
    opening = pending;
    const clear = () => { if (opening === pending) opening = undefined; };
    pending.then(clear, clear);
    return pending;
  }

  async function retry(operation) {
    for (let attempt = 0; ; attempt++) {
      let db;
      try {
        db = await open();
        return await operation(db);
      } catch (error) {
        if (!transientErrors.has(error?.name)) {
          if (error?.name === 'QuotaExceededError') throw new Error('浏览器存储空间不足，本次未保存。请先导出备份，再释放设备空间。', { cause: error });
          if (error?.name === 'SecurityError') throw new Error('浏览器未允许访问本地词库，请允许网站保存数据后重试。', { cause: error });
          throw error;
        }
        release(db);
        if (attempt >= retryDelays.length) throw new Error(recoveryMessage, { cause: error });
        await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
      }
    }
  }

  function transaction(db, mode, run) {
    return new Promise((resolve, reject) => {
      // A closing connection throws here synchronously, before any write.
      const tx = db.transaction('state', mode);
      let result, failure, settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        error ? reject(error) : resolve(result);
      };
      const timer = setTimeout(() => {
        failure = new Error(recoveryMessage);
        try { tx.abort(); } catch { /* May already have finished. */ }
        release(db);
        // A timeout has an uncertain outcome: do not automatically repeat it.
        finish(failure);
      }, timeoutMs);
      tx.oncomplete = () => finish();
      tx.onabort = () => finish(failure || tx.error || new DOMException('Transaction aborted', 'AbortError'));
      tx.onerror = event => { failure ||= event.target.error; };
      const abort = error => {
        failure = error;
        try { tx.abort(); } catch { finish(error); }
      };
      try {
        run(tx.objectStore('state'), value => { result = value; }, abort);
      } catch (error) { abort(error); }
    });
  }

  return {
    close: () => release(),
    load: () => retry(db => transaction(db, 'readonly', (store, done, abort) => {
      const request = store.get('current');
      request.onsuccess = () => {
        try { done(request.result === undefined ? emptyState() : validateState(request.result)); }
        catch (error) { abort(error); }
      };
    })),
    save: async next => {
      validateState(next);
      return retry(db => transaction(db, 'readwrite', (store, done, abort) => {
        const request = store.get('current');
        request.onsuccess = () => {
          try {
            const current = request.result === undefined ? emptyState() : validateState(request.result);
            if (current.revision !== next.revision) {
              abort(new Error('另一个窗口已修改词库，请先导出备份，再刷新页面后重试。'));
              return;
            }
            // Both snapshots and the revision commit atomically. A retry only
            // happens after a confirmed abort or before a transaction starts.
            store.put(current, 'previous');
            store.put({ ...next, revision: next.revision + 1 }, 'current');
            done(next.revision + 1);
          } catch (error) { abort(error); }
        };
      }));
    }
  };
}

export function reconnectOnResume(storage, pageWindow, pageDocument) {
  const resume = () => { if (pageDocument.visibilityState === 'visible') storage.close(); };
  const show = event => { if (event.persisted) storage.close(); };
  pageDocument.addEventListener('visibilitychange', resume);
  pageWindow.addEventListener('pageshow', show);
  return () => {
    pageDocument.removeEventListener('visibilitychange', resume);
    pageWindow.removeEventListener('pageshow', show);
  };
}
