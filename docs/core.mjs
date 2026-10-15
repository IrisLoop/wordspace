export const defaults = { interval: 8, repeats: 2, rate: 1, voice: '', shuffle: false, answerMode: 'handwriting', audioSource: 'recording', accent: 'us' };
export const emptyState = () => ({ version: 1, revision: 0, nextLibrary: 1, libraries: [], mistakes: {}, history: [], settings: { ...defaults } });
export const normalize = word => word.trim().toLowerCase().replace(/[’‘]/g, "'");
export const answerCorrect = (answer, word) => normalize(answer) === normalize(word);
export const stopWords = new Set('a an the and or but if of to in on at for from with by as is are was were be been being it its this that these those i you he she we they me my your his her our their not do does did have has had'.split(' '));
export function extractWords(text, skipCommon = false) {
  const tokens = text.replace(/([a-z])-\r?\n([a-z])/gi, '$1$2').replace(/[’‘]/g, "'").match(/[a-zA-Z]+(?:['-][a-zA-Z]+)*/g) || [];
  return [...new Set(tokens.map(normalize))].filter(w => (w.length > 1 || ['a', 'i'].includes(w)) && w.length <= 48 && (!skipCommon || !stopWords.has(w)));
}
export function allWords(state) {
  return state.libraries.flatMap(lib => lib.words.map(word => ({ ...word, libraryId: lib.id, libraryName: lib.name })));
}
export function mistakeWords(state) {
  const merged = new Map();
  for (const item of allWords(state)) {
    if (!Object.hasOwn(state.mistakes, item.word)) continue;
    if (!merged.has(item.word)) merged.set(item.word, { ...item, sources: [] });
    const entry = merged.get(item.word);
    if (!entry.sources.includes(item.libraryName)) entry.sources.push(item.libraryName);
  }
  return [...merged.values()];
}
export function applyReview(state, words, wrong, mode) {
  const keys = new Set(wrong);
  for (const word of new Set(words.map(w => w.word))) {
    if (keys.has(word)) state.mistakes[word] = { count: (state.mistakes[word]?.count || 0) + 1, updatedAt: new Date().toISOString() };
    else if (mode === 'mistakes') delete state.mistakes[word];
  }
}
export function validateState(data) {
  const fail = () => { throw new Error('词库数据格式不正确，请选择本软件导出的 JSON 备份。'); };
  if (!data || data.version !== 1 || !Array.isArray(data.libraries) || !Array.isArray(data.history) || !data.settings || !data.mistakes || Array.isArray(data.mistakes)) fail();
  if (data.libraries.length > 5000 || data.history.length > 5000) fail();
  const ids = new Set(); let total = 0;
  for (const lib of data.libraries) {
    if (!lib || typeof lib.id !== 'string' || ids.has(lib.id) || typeof lib.name !== 'string' || lib.name.length > 100 || typeof lib.createdAt !== 'string' || !Array.isArray(lib.words) || !lib.words.length) fail();
    if(!Number.isFinite(Date.parse(lib.createdAt)) || (lib.sources !== undefined && (!Array.isArray(lib.sources) || lib.sources.length > 20 || lib.sources.some(x => typeof x !== 'string' || x.length > 500)))) fail();
    ids.add(lib.id); total += lib.words.length;
    const seen = new Set();
    for (const w of lib.words) {
      if (!w || typeof w.word !== 'string' || !/^[a-z]+(?:['-][a-z]+)*$/.test(w.word) || w.word.length > 48 || typeof w.meaning !== 'string' || w.meaning.length > 1000 || seen.has(w.word)) fail();
      if(w.phonetic !== undefined && (typeof w.phonetic !== 'string' || w.phonetic.length > 200)) fail();
      seen.add(w.word);
    }
  }
  if (total > 100000) fail();
  for (const [key, val] of Object.entries(data.mistakes)) if (!/^[a-z]+(?:['-][a-z]+)*$/.test(key) || !val || !Number.isInteger(val.count) || val.count < 1) fail();
  for (const h of data.history) if (!h || typeof h.id !== 'string' || typeof h.date !== 'string' || !Number.isFinite(Date.parse(h.date)) || !['library', 'mistakes'].includes(h.mode) || !Number.isInteger(h.total) || !Number.isInteger(h.wrong) || h.total < 1 || h.wrong < 0 || h.wrong > h.total) fail();
  if (!Number.isInteger(data.nextLibrary) || data.nextLibrary < 1 || !Number.isInteger(data.revision) || data.revision < 0) fail();
  const s = data.settings;
  if (!Number.isInteger(s.interval) || s.interval < 2 || s.interval > 30 || !Number.isInteger(s.repeats) || s.repeats < 1 || s.repeats > 3 || typeof s.rate !== 'number' || s.rate < 0.5 || s.rate > 1.3 || typeof s.voice !== 'string' || typeof s.shuffle !== 'boolean') fail();
  for(const [key,allowed] of Object.entries({answerMode:['handwriting','typing'],audioSource:['recording','system'],accent:['us','uk']})) if(s[key] !== undefined && !allowed.includes(s[key])) fail();
  data.settings={...defaults,...s};
  return data;
}
export function reviewAnswers(words) {
  return new Set(words.filter(w=>!answerCorrect(w.answer||'',w.word)).map(w=>w.word));
}
