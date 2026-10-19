import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
const require=createRequire(import.meta.url);
const { webkit, chromium, devices }=require(process.env.WORDSPACE_PLAYWRIGHT || 'playwright');
const fixtures=path.resolve('tests/fixtures/imports');
const expected=JSON.parse(await readFile(path.join(fixtures,'expected.json'),'utf8'));
const server=makeServer({dataDir:'test-results/unused-import-data'});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
const results=[];
let browser;
try {
  for(const kind of ['webkit','chromium']) {
    browser=await (kind==='webkit'?webkit:chromium).launch(kind==='chromium'&&process.env.WORDSPACE_CHROMIUM?{executablePath:process.env.WORDSPACE_CHROMIUM}:{});
    const context=await browser.newContext(kind==='webkit'?devices['iPhone 13']:{viewport:{width:393,height:851},isMobile:true});
    const missingAPIs='delete Uint8Array.prototype.toHex;delete Uint8Array.prototype.toBase64;delete Uint8Array.fromBase64;delete Promise.withResolvers;';
    await context.addInitScript(missingAPIs);
    await context.route('**/pdfjs-dist/legacy/build/pdf.worker.mjs',async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:missingAPIs+'\n'+await response.text()});
    });
    const page=await context.newPage(),errors=[];
    page.setDefaultTimeout(120000);
    page.on('pageerror',e=>errors.push(e.message));
    await page.route(url,async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:(await response.text()).replace('<head>','<head><meta name="wordspace-storage" content="browser">')});
    });
    await page.goto(url);
    async function importFile(filename,options={}) {
      const started=Date.now();console.log(`CHECK ${kind}: ${filename}`);
      await page.locator('[data-action="import"]').first().click();
      if(options.pdfMode)await page.locator('#pdf-mode').selectOption(options.pdfMode);
      if(options.language)await page.locator('#ocr-language').selectOption(options.language);
      await page.locator('#file-picker').setInputFiles(path.join(fixtures,filename));
      await page.locator('.preview-list, #import-error:not([hidden])').waitFor();
      if(await page.locator('#import-error:not([hidden])').count())throw new Error(await page.locator('#import-error').innerText());
      const words=await page.locator('[data-draft-word]').evaluateAll(inputs=>inputs.map(input=>input.value));
      const found=expected.filter(word=>words.includes(word));
      results.push({engine:kind,file:filename,mode:options.pdfMode||'auto',correct:found.length,expected:expected.length,extra:words.filter(word=>!expected.includes(word)),words});
      assert.equal(found.length,expected.length,`${kind} ${filename}: ${words.join(', ')}`);
      if(filename==='mixed-vocabulary.png') {
        const suspicious=page.locator('[data-draft-word]').filter({visible:true});
        assert.ok(await suspicious.count()>=expected.length);
        await page.locator('#show-uncertain').check();
        assert.equal(await page.locator('.preview-row:not(.needs-review):visible').count(),0);
        assert.ok(await page.locator('.preview-row.needs-review:visible').count()>0);
        await mkdir('test-results',{recursive:true});
        await page.screenshot({path:'test-results/ocr-review-mobile.png',fullPage:true});
      }
      console.log(`PASS ${kind}: ${filename} ${found.length}/${expected.length} target words; ${words.length-found.length} other words; ${Date.now()-started} ms`);
      await page.getByRole('button',{name:'关闭',exact:true}).click();
      return words;
    }
    assert.equal((await importFile('text.pdf')).length,expected.length);
    if(kind==='webkit') {
      await importFile('mixed-vocabulary.png');
      await importFile('scan.pdf');
      await importFile('hybrid.pdf');
      await importFile('text.pdf',{pdfMode:'scan',language:'english'});
      await page.locator('[data-action="import"]').first().click();
      await page.locator('#file-picker').setInputFiles(path.join(fixtures,'locked.pdf'));
      await page.locator('#import-error').waitFor();
      assert.match(await page.locator('#import-error').innerText(),/需要密码/);
      await mkdir('test-results',{recursive:true});
      await page.screenshot({path:'test-results/import-mobile.png',fullPage:true});
      console.log('PASS webkit: password-protected PDF gives actionable feedback');
    }
    assert.deepEqual(errors,[]);
    await browser.close();browser=undefined;
  }
  await writeFile('test-results/import-results.json',JSON.stringify(results,null,2));
} finally {
  await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
