const abortError=()=>new DOMException('Playback cancelled','AbortError');
export const pronunciationSources=new Map();
export const LOAD_TIMEOUT_MS=4000;
export function dictionaryAudioURL(word,accent='us'){
  const normalized=word.trim().toLowerCase().replace(/[’‘]/g,"'");
  if(!/^[a-z]+(?:['-][a-z]+)*$/.test(normalized)||normalized.length>48)throw new Error('请检查英文单词拼写。');
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(normalized)}&type=${accent==='uk'?1:2}`;
}
export class PronunciationService {
  constructor(engine=globalThis.speechSynthesis,Utterance=globalThis.SpeechSynthesisUtterance,{createAudio=url=>new Audio(url),loadTimeoutMs=LOAD_TIMEOUT_MS}={}){
    Object.assign(this,{engine,Utterance,createAudio,loadTimeoutMs});this.generation=0;this.cache=new Map();
  }
  async unlock(){}
  entry(word,settings){
    const url=dictionaryAudioURL(word,settings.accent);
    let entry=this.cache.get(url);
    if(entry?.failed){this.cache.delete(url);entry=null;}
    if(!entry){
      const audio=this.createAudio(url);audio.preload='auto';
      // Normal cross-origin media playback preserves the publisher's audio.
      // This endpoint does not offer CORS, so do not route it through Web Audio.
      entry={audio,url,failed:false};
      audio.addEventListener('error',()=>{entry.failed=true;});
      this.cache.set(url,entry);audio.load();
      if(this.cache.size>12){for(const [key,old] of this.cache){if(old!==entry&&old!==this.active){old.audio.pause();old.audio.removeAttribute('src');old.audio.load();this.cache.delete(key);break;}}}
    }
    return entry;
  }
  prefetch(word,settings){if(settings.audioSource!=='system'){try{this.entry(word,settings);}catch{}}}
  cancel(){this.generation++;this.stop?.();this.stop=null;}
  async play(word,settings,onStart=()=>{},onSource=()=>{}){
    this.cancel();const generation=this.generation;
    pronunciationSources.delete(word);
    if(settings.audioSource==='system'){
      onSource('系统英语语音 · 手动选择');
      return this.speakSystem(word,settings,onStart,generation);
    }
    const entry=this.entry(word,settings),audio=entry.audio;this.active=entry;
    audio.playbackRate=Math.max(.6,Math.min(1.2,settings.rate||1));
    audio.preservesPitch=true;audio.webkitPreservesPitch=true;audio.mozPreservesPitch=true;
    try{audio.currentTime=0;}catch{}
    onSource('正在加载有道词典发音…');
    return new Promise((resolve,reject)=>{
      let settled=false,started=false,timer;
      const cleanup=()=>{
        clearTimeout(timer);audio.removeEventListener('playing',playing);audio.removeEventListener('waiting',waiting);audio.removeEventListener('ended',ended);audio.removeEventListener('error',failed);
        if(this.active===entry)this.active=null;if(generation===this.generation)this.stop=null;
      };
      const finish=error=>{if(settled)return;settled=true;cleanup();if(error)reject(error);else resolve();};
      const stopWith=error=>{audio.pause();try{audio.currentTime=0;}catch{}finish(error);};
      const arm=ms=>{clearTimeout(timer);timer=setTimeout(()=>{
        entry.failed=true;stopWith(new Error('有道发音加载超过 4 秒，已暂停。请检查网络后点击继续，或在偏好中手动选择系统语音。'));
        audio.removeAttribute('src');audio.load();
      },ms);};
      const playing=()=>{
        if(settled||generation!==this.generation)return;
        clearTimeout(timer);
        timer=setTimeout(()=>stopWith(new Error('音频播放中断，已暂停。请点击继续重试。')),Math.min(20000,((Number.isFinite(audio.duration)?audio.duration:8)/audio.playbackRate+2)*1000));
        if(!started){started=true;pronunciationSources.set(word,{provider:'youdao',source:`https://dict.youdao.com/result?word=${encodeURIComponent(word)}&lang=en`,accent:settings.accent==='uk'?'英式':'美式'});onSource(`有道词典 · ${settings.accent==='uk'?'英式':'美式'}原音 · 保持音高`);onStart();}
      };
      const waiting=()=>{if(!settled)arm(this.loadTimeoutMs);};
      const ended=()=>{if(started)finish();else stopWith(new Error('未能播放这个单词，已暂停。请点击继续重试。'));};
      const failed=()=>{entry.failed=true;stopWith(new Error('有道词典发音暂不可用，已暂停。请检查网络后重试，或手动选择系统语音。'));};
      this.stop=()=>stopWith(abortError());
      audio.addEventListener('playing',playing);audio.addEventListener('waiting',waiting);audio.addEventListener('ended',ended);audio.addEventListener('error',failed);
      arm(this.loadTimeoutMs);
      try{audio.play()?.catch(error=>{
        if(settled)return;
        if(generation!==this.generation)return stopWith(abortError());
        stopWith(new Error(error.name==='NotAllowedError'?'浏览器阻止了自动播放。请点击继续或试听发音。':'音频播放失败，已暂停。请点击继续重试。'));
      });}catch{failed();}
    });
  }
  speakSystem(word,settings,onStart,generation){
    if(!this.engine||!this.Utterance)return Promise.reject(new Error('没有可用的英语语音，请使用 Edge / Chrome 并安装英语语音。'));
    return new Promise((resolve,reject)=>{
      const voices=this.engine.getVoices(),lang=settings.accent==='uk'?'en-GB':'en-US',utterance=new this.Utterance(word);
      utterance.voice=voices.find(v=>v.voiceURI===settings.voice)||voices.find(v=>v.lang===lang&&/Natural|Neural|Online/i.test(v.name))||voices.find(v=>v.lang===lang)||voices.find(v=>v.lang.startsWith('en'));
      utterance.lang=utterance.voice?.lang||lang;utterance.rate=settings.rate;
      let watchdog,settled=false;
      const finish=error=>{if(settled)return;settled=true;clearTimeout(watchdog);utterance.onstart=null;utterance.onend=null;utterance.onerror=null;if(generation===this.generation)this.stop=null;error?reject(error):resolve();};
      this.stop=()=>{finish(abortError());this.engine.cancel();};
      utterance.onstart=()=>{if(generation===this.generation){clearTimeout(watchdog);watchdog=setTimeout(()=>{finish(new Error('系统语音播放中断，请重试。'));this.engine.cancel();},15000);onStart();}};
      utterance.onerror=e=>finish(new Error(`系统语音播放失败（${e.error}），请更换英语语音后重试。`));
      utterance.onend=()=>finish();
      watchdog=setTimeout(()=>{finish(new Error('系统语音启动超时，请点击继续重试。'));this.engine.cancel();},this.loadTimeoutMs);
      this.utterance=utterance;
      try{this.engine.speak(utterance);}catch(e){finish(e);}
    });
  }
}
export const pronunciation=new PronunciationService();
