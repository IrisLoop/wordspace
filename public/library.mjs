import { normalize } from './core.mjs';

export function planLibraryAddition(library, candidates) {
  const seen=new Set(library.words.map(item=>item.word)), words=[];
  let duplicates=0;
  for(const item of candidates) {
    const word=normalize(item.word);
    if(seen.has(word)){duplicates++;continue;}
    seen.add(word);words.push({...item,word});
  }
  return {words,duplicates};
}

export function appendToLibrary(state, id, candidates, sources=[]) {
  const library=state.libraries.find(item=>item.id===id);
  if(!library)throw new Error('目标词库已不存在，请关闭弹窗后重新选择词库。');
  const plan=planLibraryAddition(library,candidates);
  if(plan.words.length) {
    library.words.push(...plan.words);
    library.sources=[...new Set([...(library.sources||[]),...sources])].slice(0,20);
  }
  return {added:plan.words.length,duplicates:plan.duplicates};
}
