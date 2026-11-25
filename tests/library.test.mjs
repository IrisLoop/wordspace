import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,validateState} from '../public/core.mjs';
import {appendToLibrary} from '../public/library.mjs';

function sample(){
  const state=emptyState();state.nextLibrary=3;
  state.libraries=[{id:'one',name:'词库1',createdAt:'2026-11-25T00:00:00Z',sources:['original.pdf'],words:[{word:'ornament',meaning:'用户自定义释义',phonetic:'test'}]},
    {id:'two',name:'词库2',createdAt:'2026-11-25T00:00:00Z',words:[{word:'apple',meaning:'苹果'}]}];
  state.mistakes.ornament={count:2};state.history=[{id:'history',mode:'library',date:'2026-11-25T00:00:00Z',total:1,wrong:1}];
  return state;
}
test('append merges only new normalized words and preserves library identity and learning data',()=>{
  const state=sample(),before=structuredClone(state);
  const result=appendToLibrary(state,'one',[{word:'Ornament',meaning:'不能覆盖'},{word:' Apple ',meaning:'苹果'},{word:'apple',meaning:'重复'},{word:'pear',meaning:'梨'}],['extra.txt']);
  assert.deepEqual(result,{added:2,duplicates:2});
  assert.deepEqual(state.libraries[0].words.map(w=>w.word),['ornament','apple','pear']);
  assert.deepEqual(state.libraries[0].words[0],before.libraries[0].words[0]);
  assert.deepEqual({...state,libraries:before.libraries},before);
  assert.equal(state.libraries[0].createdAt,before.libraries[0].createdAt);
  assert.equal(state.libraries[0].name,before.libraries[0].name);
  assert.deepEqual(state.libraries[1],before.libraries[1]);
  validateState(state);
});
test('duplicates alone do not modify data or consume a library number',()=>{
  const state=sample(),before=structuredClone(state);
  assert.deepEqual(appendToLibrary(state,'one',[{word:'ornament',meaning:'重复'}],['unused.txt']),{added:0,duplicates:1});
  assert.deepEqual(state,before);
});
test('a missing target never silently becomes a new library',()=>{
  const state=sample(),before=structuredClone(state);
  assert.throws(()=>appendToLibrary(state,'removed',[{word:'apple',meaning:'苹果'}]),/不存在/);
  assert.deepEqual(state,before);
});
test('repeated uploads respect the existing source-count limit',()=>{
  const state=sample();state.libraries[0].sources=Array.from({length:20},(_,i)=>`${i}.txt`);
  appendToLibrary(state,'one',[{word:'apple',meaning:'苹果'}],['one-more.txt']);
  assert.equal(state.libraries[0].sources.length,20);validateState(state);
});
