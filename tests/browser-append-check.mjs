import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {makeServer} from '../server.mjs';
const require=createRequire(import.meta.url);
const {webkit,devices}=require(process.env.WORDSPACE_PLAYWRIGHT||'playwright');
const server=makeServer({dataDir:'test-results/unused-append-test'});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
let browser;
try{
  browser=await webkit.launch();
  for(const mobile of [false,true]){
    const context=await browser.newContext(mobile?devices['iPhone 13']:{viewport:{width:1440,height:1000}});
    await context.addInitScript(()=>{
      window.failSave=false;
      const transaction=IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction=function(...args){if(window.failSave&&args[1]==='readwrite')throw new DOMException('Full','QuotaExceededError');return transaction.apply(this,args);};
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route(url,async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('<head>','<head><meta name="wordspace-storage" content="browser">')});});
    await page.goto(url);
    const snapshot=()=>page.evaluate(async()=>{const {loadState}=await import('./storage.mjs?v=2.1.1');return loadState();});
    const parse=async text=>{await page.locator('#paste-text').fill(text);await page.getByRole('button',{name:'提取单词'}).click();await page.locator('.preview-list').waitFor();};
    await page.getByRole('button',{name:'粘贴文本',exact:true}).click();
    await parse('ornament');await page.locator('[data-draft-meaning="0"]').fill('用户自定义释义');
    await page.getByRole('button',{name:'保存词库',exact:true}).click();
    await page.getByRole('heading',{name:/^词库1/}).waitFor();
    await page.getByRole('button',{name:'加入错词本 ornament',exact:true}).click();
    await page.getByRole('button',{name:'移出错词本 ornament',exact:true}).waitFor();
    const before=await snapshot();

    await page.getByRole('button',{name:'新增词汇',exact:true}).click();
    await parse('Ornament\napple\npear\napple');
    assert.equal(await page.locator('#library-name').count(),0);
    assert.match(await page.locator('#draft-count').innerText(),/将新增 2 个词.*跳过 1/);
    await page.getByRole('button',{name:'加入当前词库',exact:true}).click();
    await page.locator('#modal').waitFor({state:'hidden'});
    let state=await snapshot();
    assert.equal(state.libraries.length,1);assert.equal(state.nextLibrary,2);
    assert.deepEqual(state.libraries[0].words.map(w=>w.word),['ornament','apple','pear']);
    assert.deepEqual(state.libraries[0].words[0],before.libraries[0].words[0]);
    assert.equal(state.libraries[0].id,before.libraries[0].id);
    assert.equal(state.libraries[0].createdAt,before.libraries[0].createdAt);
    assert.deepEqual(state.mistakes,before.mistakes);
    assert.deepEqual(state.history,before.history);

    await page.getByRole('button',{name:'新增词汇',exact:true}).click();await parse('ornament');
    assert.equal(await page.getByRole('button',{name:'加入当前词库',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'重新导入',exact:true}).click();
    await page.getByRole('heading',{name:'新增词汇 · 词库1',exact:true}).waitFor();
    await page.getByRole('button',{name:'上传文件',exact:true}).click();
    await page.locator('#file-picker').setInputFiles({name:'unsupported.xyz',mimeType:'text/plain',buffer:Buffer.from('apple')});
    await page.locator('#import-error').waitFor();
    await page.getByRole('heading',{name:'新增词汇 · 词库1',exact:true}).waitFor();
    await page.locator('#file-picker').setInputFiles({name:'more.txt',mimeType:'text/plain',buffer:Buffer.from('pear\nbanana')});
    await page.locator('.preview-list').waitFor();
    assert.match(await page.locator('#draft-count').innerText(),/将新增 1 个词.*跳过 1/);
    await page.evaluate(()=>{window.failSave=true;});
    await page.getByRole('button',{name:'加入当前词库',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#saved-status').textContent==='保存失败 · 请重试');
    assert.equal((await snapshot()).libraries[0].words.length,3);
    assert.equal(await page.locator('[data-draft-word="1"]').inputValue(),'banana');
    await page.evaluate(()=>{window.failSave=false;});
    await page.getByRole('button',{name:'加入当前词库',exact:true}).click();
    await page.locator('#modal').waitFor({state:'hidden'});
    state=await snapshot();assert.equal(state.libraries[0].words.length,4);assert.equal(state.libraries.length,1);
    assert.ok(state.libraries[0].sources.includes('more.txt'));
    await page.reload();await page.getByRole('button',{name:/词库1.*4 个单词/}).click();
    assert.equal(await page.locator('tbody tr').count(),4);
    await mkdir('test-results',{recursive:true});
    await page.screenshot({path:`test-results/append-${mobile?'mobile':'desktop'}.png`,fullPage:true});
    // A cancelled append must not leak its target into a later new-library import.
    await page.getByRole('button',{name:'新增词汇',exact:true}).click();
    await page.getByRole('button',{name:'关闭',exact:true}).click();
    await page.getByRole('button',{name:'返回我的词库',exact:true}).click();
    await page.getByRole('button',{name:'导入新词库',exact:true}).click();
    await page.getByRole('button',{name:'粘贴文本',exact:true}).click();await parse('peach');
    await page.locator('#library-name').waitFor();
    await page.getByRole('button',{name:'保存词库',exact:true}).click();
    await page.getByRole('heading',{name:/^词库2/}).waitFor();
    state=await snapshot();assert.equal(state.libraries.length,2);assert.equal(state.nextLibrary,3);
    assert.equal(state.libraries[0].words.length,4);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${mobile?'mobile':'desktop'}: append text/file, duplicate protection, target retention, failed-save retry, reload and new-library isolation`);
    await context.close();
  }
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
