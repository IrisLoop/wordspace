import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makeServer } from '../server.mjs';
test('local persistence, concurrency protection, backup and request boundaries',async t=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'wordspace-test-'));const server=makeServer({dataDir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());const url=`http://127.0.0.1:${server.address().port}`;
 const state=await (await fetch(`${url}/api/state`)).json();assert.equal(state.revision,0);
 state.libraries.push({id:'test',name:'词库1',createdAt:new Date().toISOString(),words:[{word:'apple',meaning:'苹果'}]});state.nextLibrary=2;
 const put=s=>fetch(`${url}/api/state`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(s)});
 assert.equal((await put(state)).status,200);assert.equal((await put(state)).status,409);
 const stored=await (await fetch(`${url}/api/state`)).json();assert.equal(stored.libraries[0].words[0].meaning,'苹果');assert.equal(stored.revision,1);
 stored.settings.interval=5;assert.equal((await put(stored)).status,200);assert.equal(JSON.parse(await readFile(path.join(dataDir,'wordspace.previous.json'),'utf8')).revision,1);
 assert.equal((await fetch(`${url}/api/state`,{method:'PUT',headers:{'Content-Type':'application/json',Origin:'https://untrusted.example'},body:JSON.stringify(stored)})).status,403);
 assert.equal((await fetch(`${url}/data/wordspace.json`)).status,404);assert.equal((await fetch(`${url}/vendor/..%2f..%2fserver.mjs`)).status,403);
 assert.equal((await fetch(url)).status,200);
});
