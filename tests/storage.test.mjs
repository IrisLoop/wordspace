import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, forceCloseDatabase } from 'fake-indexeddb';
import { createBrowserStorage, reconnectOnResume } from '../public/browser-storage.mjs';
import { emptyState } from '../public/core.mjs';

function fixture(t, options = {}) {
  const factory = new IDBFactory(), connections = [];
  let opens = 0;
  const indexedDB = { open(...args) {
    opens++;
    const request = factory.open(...args);
    request.addEventListener('success', () => connections.push(request.result));
    return request;
  } };
  const storage = createBrowserStorage({ indexedDB, name:'wordspace:/wordspace/', retryDelays:[0, 0], ...options });
  t.after(() => { storage.close(); connections.forEach(db => db.close()); });
  return { storage, factory, connections, get opens() { return opens; } };
}
function sample() {
  const state = emptyState();
  state.libraries.push({ id:'first', name:'手机词库', createdAt:new Date().toISOString(), words:[{ word:'apple', meaning:'苹果' }] });
  state.nextLibrary = 2;
  state.mistakes.apple = { count:2, updatedAt:new Date().toISOString() };
  state.history.push({ id:'practice', date:new Date().toISOString(), mode:'library', total:1, wrong:1 });
  return state;
}
async function rawGet(db, key) {
  return new Promise((resolve, reject) => {
    const request = db.transaction('state').objectStore('state').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

test('closing connection without a close event reconnects and preserves snapshots', async t => {
  const f = fixture(t), next = sample();
  next.revision = await f.storage.save(next);
  f.connections[0].close(); // Safari's synchronous InvalidStateError, no close event.
  assert.deepEqual(await f.storage.load(), next);
  f.connections.at(-1).close();
  next.libraries[0].name = '改名后的手机词库';
  assert.equal(await f.storage.save(next), 2);
  const saved = await f.storage.load();
  assert.equal(saved.revision, 2);
  assert.deepEqual(saved.mistakes, next.mistakes);
  assert.deepEqual(saved.history, next.history);
  const previous = await rawGet(f.connections.at(-1), 'previous');
  assert.equal(previous.revision, 1);
  assert.equal(previous.libraries[0].name, '手机词库');
  assert.equal(f.opens, 3);
});

test('unexpected close and versionchange discard the cached connection', async t => {
  const f = fixture(t);
  await f.storage.save(sample());
  forceCloseDatabase(f.connections[0]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.storage.load()).libraries.length, 1);
  f.connections.at(-1).onversionchange();
  assert.equal((await f.storage.load()).revision, 1);
  assert.equal(f.opens, 3);
});

test('an aborted write retries once and does not duplicate revisions or overwrite the previous snapshot', async t => {
  const f = fixture(t), next = sample();
  next.revision = await f.storage.save(next);
  const db = f.connections[0], realTransaction = db.transaction.bind(db);
  db.transaction = (...args) => {
    const tx = realTransaction(...args);
    setImmediate(() => forceCloseDatabase(db));
    return tx;
  };
  next.settings.interval = 4;
  assert.equal(await f.storage.save(next), 2);
  assert.equal((await f.storage.load()).settings.interval, 4);
  assert.equal((await rawGet(f.connections.at(-1), 'previous')).settings.interval, 8);
  assert.equal(f.opens, 2);
});

test('recovery still rejects stale writes from another tab', async t => {
  const f = fixture(t);
  await f.storage.save(sample());
  const stale = await f.storage.load(), fresh = structuredClone(stale);
  fresh.libraries[0].name = '另一个窗口的新名称';
  await f.storage.save(fresh);
  f.connections[0].close();
  await assert.rejects(f.storage.save(stale), /另一个窗口/);
  assert.equal((await f.storage.load()).libraries[0].name, fresh.libraries[0].name);
  assert.equal((await f.storage.load()).revision, 2);
  assert.equal(f.opens, 2);
});

test('failed open promises are discarded; retries are bounded and a later user retry can recover', async () => {
  let opens = 0;
  const factory = new IDBFactory();
  const indexedDB = { open(...args) {
    if (++opens <= 3) throw new DOMException('Connection to Indexed Database server lost.', 'UnknownError');
    return factory.open(...args);
  } };
  const storage = createBrowserStorage({ indexedDB, name:'recover', retryDelays:[0,0] });
  await assert.rejects(storage.load(), /不要清除网站数据/);
  assert.equal(opens, 3);
  assert.equal((await storage.load()).revision, 0);
  assert.equal(opens, 4);
  storage.close();
});

test('quota failure does not retry or change any saved data; the pending save remains usable', async t => {
  const f = fixture(t), next = sample();
  next.revision = await f.storage.save(next);
  const db = f.connections[0], realTransaction = db.transaction.bind(db);
  db.transaction = (...args) => {
    const tx = realTransaction(...args), store = tx.objectStore('state');
    store.put = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    return tx;
  };
  next.libraries[0].name = '待保存名称';
  await assert.rejects(f.storage.save(next), /空间不足/);
  db.transaction = realTransaction;
  assert.equal((await f.storage.load()).libraries[0].name, '手机词库');
  assert.equal(next.revision, 1);
  assert.equal(f.opens, 1);
  assert.equal(await f.storage.save(next), 2);
});

test('concurrent callers share an open and revision protection allows only one save', async t => {
  const f = fixture(t);
  await Promise.all([f.storage.load(), f.storage.load()]);
  assert.equal(f.opens, 1);
  const results = await Promise.allSettled([f.storage.save(sample()), f.storage.save(sample())]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await f.storage.load()).revision, 1);
});

test('foreground and back/forward restore release connections without reloading or clearing state', async t => {
  const f = fixture(t), win = new EventTarget(), doc = new EventTarget();
  const unbind = reconnectOnResume(f.storage, win, doc);
  t.after(unbind);
  await f.storage.save(sample());
  doc.visibilityState = 'hidden';doc.dispatchEvent(new Event('visibilitychange'));
  await f.storage.load();assert.equal(f.opens, 1);
  doc.visibilityState = 'visible';doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal((await f.storage.load()).libraries.length, 1);
  const event = new Event('pageshow');event.persisted = true;win.dispatchEvent(event);
  assert.equal((await f.storage.load()).mistakes.apple.count, 2);
  assert.equal(f.opens, 3);
});

test('a stuck open fails with guidance, closes a late result and permits another attempt', async () => {
  const requests = [];
  const indexedDB = { open() { const request = {};requests.push(request);return request; } };
  const storage = createBrowserStorage({ indexedDB, name:'timeout', timeoutMs:10 });
  await assert.rejects(storage.load(), /重新打开 Safari/);
  let closed = false;
  requests[0].result = { close() { closed = true; } };
  requests[0].onsuccess();
  assert.equal(closed, true);
  await assert.rejects(storage.load(), /重新打开 Safari/);
  assert.equal(requests.length, 2);
});

test('a corrupt stored record is never replaced by an empty library', async t => {
  const f = fixture(t);
  await f.storage.load();
  const db = f.connections[0];
  await new Promise(resolve => { const tx = db.transaction('state', 'readwrite');tx.objectStore('state').put(null, 'current');tx.oncomplete = resolve; });
  await assert.rejects(f.storage.load(), /格式不正确/);
  await assert.rejects(f.storage.save(sample()), /格式不正确/);
  assert.equal(await rawGet(db, 'current'), null);
});
