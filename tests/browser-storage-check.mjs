// Run with Playwright installed (or WORDSPACE_PLAYWRIGHT pointing to its package).
// Uses an isolated mobile WebKit context and an ephemeral local server, never user data.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
const require = createRequire(import.meta.url);
const { webkit, devices } = require(process.env.WORDSPACE_PLAYWRIGHT || 'playwright');
const server = makeServer({ dataDir:'test-results/unused-browser-test-data' });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
let browser, debugPage;
try {
  browser = await webkit.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  await context.addInitScript(() => {
    window.storageFault = { connections:[], unavailable:false };
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      if (window.storageFault.unavailable) throw new DOMException('Connection to Indexed Database server lost.', 'UnknownError');
      const request = open(...args);
      request.addEventListener('success', () => window.storageFault.connections.push(request.result));
      return request;
    };
  });
  const page = await context.newPage(), errors = [];
  debugPage = page;
  page.on('pageerror', error => errors.push(error.message));
  await page.route(url, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body:(await response.text()).replace('<head>', '<head><meta name="wordspace-storage" content="browser">') });
  });
  await page.goto(url);
  await page.getByRole('button', { name:'粘贴文本', exact:true }).click();
  await page.locator('#paste-text').fill('apple\ncuriosity');
  await page.getByRole('button', { name:'提取单词' }).click();
  await page.locator('#library-name').fill('Safari 重连测试');
  await page.evaluate(() => window.storageFault.connections.forEach(db => db.close()));
  await page.getByRole('button', { name:'保存词库', exact:true }).click();
  await page.getByRole('heading', { name:'Safari 重连测试' }).waitFor();
  console.log('PASS: closed connection recovers while saving a two-word mobile library');

  await page.getByRole('button', { name:'重命名词库' }).click();
  await page.locator('#rename-input').fill('恢复后继续学习');
  await page.evaluate(() => {
    window.storageFault.connections.forEach(db => db.close());
    window.storageFault.unavailable = true;
  });
  await page.getByRole('button', { name:'保存', exact:true }).click();
  await page.waitForFunction(() => document.querySelector('#saved-status').textContent === '保存失败 · 请重试');
  assert.equal(await page.locator('#rename-input').inputValue(), '恢复后继续学习');
  assert.match(await page.locator('#toast').innerText(), /不要清除网站数据/);
  await page.evaluate(() => { window.storageFault.unavailable = false; });
  await page.getByRole('button', { name:'保存', exact:true }).click();
  await page.getByRole('heading', { name:'恢复后继续学习' }).waitFor();
  console.log('PASS: persistent interruption retains the edit and a user retry succeeds');

  await page.evaluate(() => {
    window.storageFault.connections.forEach(db => db.close());
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted:true }));
  });
  await page.getByRole('button', { name:'加入错词本 apple', exact:true }).click();
  await page.getByRole('button', { name:'移出错词本 apple', exact:true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name:/恢复后继续学习/ }).click();
  await page.getByRole('button', { name:'移出错词本 apple', exact:true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 2);
  const snapshot = await page.evaluate(async () => {
    const { loadState } = await import('./storage.mjs?v=2.1.1');
    return loadState();
  });
  assert.equal(snapshot.revision, 3);
  assert.equal(snapshot.libraries.length, 1);
  assert.equal(snapshot.mistakes.apple.count, 1);
  console.log('PASS: back/forward restore, wrong-word mark and reload preserve exactly three commits');
  await mkdir('test-results', { recursive:true });
  await page.screenshot({ path:'test-results/safari-storage-recovery.png', fullPage:true });

  // A fresh tab must not offer a writable empty library after a failed load.
  const failurePage = await context.newPage();
  failurePage.on('pageerror', error => errors.push(error.message));
  await failurePage.addInitScript(() => { window.storageFault.unavailable = true; });
  await failurePage.route(url, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body:(await response.text()).replace('<head>', '<head><meta name="wordspace-storage" content="browser">') });
  });
  await failurePage.goto(url);
  await failurePage.getByRole('heading', { name:'暂时无法连接词库' }).waitFor();
  await failurePage.getByRole('button', { name:'我的词库', exact:false }).click();
  await failurePage.getByRole('heading', { name:'暂时无法连接词库' }).waitFor();
  assert.equal(await failurePage.locator('[data-action="import"]').count(), 0);
  await failurePage.evaluate(() => { window.storageFault.unavailable = false; });
  await failurePage.getByRole('button', { name:'重新连接', exact:true }).click();
  await failurePage.getByRole('button', { name:/恢复后继续学习/ }).waitFor();
  console.log('PASS: failed startup stays guarded and reconnect restores the existing library');
  assert.deepEqual(errors, []);
  console.log('PASS: no uncaught errors in mobile WebKit');
} catch (error) {
  if (debugPage) console.error(await debugPage.locator('body').innerText());
  throw error;
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
