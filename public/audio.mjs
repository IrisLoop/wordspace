const abortError=()=>new DOMException('Playback cancelled','AbortError');
const recordings=new Map();
export const pronunciationSources=new Map();
let bundledIndex;
async function bundledRecording(word,accent){
  bundledIndex??=fetch(new URL('./assets/audio/index.json',import.meta.url)).then(r=>r.ok?r.json():{}).catch(()=>({}));
  const item=(await bundledIndex)[`${accent}:${word}`];if(!item)throw new Error('无内置录音');
  const response=await fetch(new URL(`./assets/audio/${item.file}`,import.meta.url));if(!response.ok)throw new Error('内置录音加载失败');
  return {...item,bytes:await response.arrayBuffer()};
}
export function centeredPCM(channels, sampleRate, before=.18, after=.25) {
  const length=channels[0].length, offset=Math.round(before*sampleRate);
  const mono=new Float32Array(offset+length+Math.round(after*sampleRate));
  let peak=0;
  for(let i=0;i<length;i++) {let sum=0;for(const channel of channels)sum+=channel[i]||0;const value=sum/channels.length;mono[offset+i]=value;peak=Math.max(peak,Math.abs(value));}
  const gain=peak>0?Math.min(1.6,.9/peak):1;
  for(let i=offset;i<offset+length;i++)mono[i]*=gain;
  return [mono,new Float32Array(mono)];
}
function safeURL(value){try{const url=new URL(value);return url.protocol==='https:'?url.href:null;}catch{return null;}}
async function originalRecording(item) {
  const source=new URL(item.sourceUrl);
  if(source.hostname!=='commons.wikimedia.org')throw new Error('没有原始录音地址');
  const query=new URLSearchParams({action:'query',prop:'imageinfo',iiprop:'url|extmetadata',format:'json',origin:'*'});
  if(source.searchParams.get('curid'))query.set('pageids',source.searchParams.get('curid'));
  else if(source.pathname.startsWith('/wiki/File:'))query.set('titles',decodeURIComponent(source.pathname.slice(6)));
  else throw new Error('无法解析原始录音地址');
  const response=await fetch(`https://commons.wikimedia.org/w/api.php?${query}`,{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('原始录音查询失败');
  const data=await response.json(),info=Object.values(data.query?.pages||{})[0]?.imageinfo?.[0];
  if(!safeURL(info?.url)||new URL(info.url).hostname!=='upload.wikimedia.org')throw new Error('原始录音不可用');
  const audio=await fetch(info.url,{signal:AbortSignal.timeout(6000)});
  if(!audio.ok)throw new Error('原始录音下载失败');
  return {bytes:await audio.arrayBuffer(),author:info.extmetadata?.Artist?.value?.replace(/<[^>]*>/g,'').slice(0,200)||'',audio:info.url};
}
async function getRecording(word,accent) {
  const key=`${accent}:${word}`;
  if(!recordings.has(key)) recordings.set(key,(async()=>{
    try{const bundled=await bundledRecording(word,accent);pronunciationSources.set(word,bundled);return bundled;}catch{}
    const response=await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,{signal:AbortSignal.timeout(6500)});
    if(!response.ok)throw new Error('无真人录音');
    const entries=await response.json();
    const candidates=entries.flatMap(e=>e.phonetics||[]).filter(p=>safeURL(p.audio)&&p.sourceUrl&&p.license?.url);
    candidates.sort((a,b)=>Number(b.audio.includes(`-${accent}.`))-Number(a.audio.includes(`-${accent}.`)));
    const item=candidates[0];if(!item)throw new Error('无可用的授权录音');
    let media;
    try{media=await originalRecording(item);}catch{
      const audio=await fetch(item.audio,{signal:AbortSignal.timeout(5000)});if(!audio.ok)throw new Error('录音加载失败');
      media={bytes:await audio.arrayBuffer(),audio:item.audio,author:''};
    }
    const result={...media,source:safeURL(item.sourceUrl),license:safeURL(item.license.url),licenseName:item.license.name||'来源许可'};
    pronunciationSources.set(word,result);return result;
  })().catch(e=>{recordings.delete(key);throw e;}));
  return recordings.get(key);
}
export class PronunciationService {
  constructor(engine=globalThis.speechSynthesis,Utterance=globalThis.SpeechSynthesisUtterance){this.engine=engine;this.Utterance=Utterance;this.generation=0;}
  async unlock(){const Context=globalThis.AudioContext||globalThis.webkitAudioContext;if(Context){this.context??=new Context();if(this.context.state==='suspended')await this.context.resume();}}
  prefetch(word,settings){if(settings.audioSource!=='system')getRecording(word,settings.accent||'us').catch(()=>{});}
  cancel(){this.generation++;clearTimeout(this.timer);this.stop?.();this.stop=null;}
  async play(word,settings,onStart=()=>{},onSource=()=>{}) {
    this.cancel();const generation=this.generation;
    if(settings.audioSource!=='system') {
      onSource('正在加载真人录音…');
      try {
        const recording=await getRecording(word,settings.accent||'us');
        if(generation!==this.generation)throw abortError();
        await this.unlock();if(!this.context)throw new Error('浏览器不支持音频处理');
        const decoded=await this.context.decodeAudioData(recording.bytes.slice(0));
        if(generation!==this.generation)throw abortError();
        const channels=centeredPCM(Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i)),decoded.sampleRate);
        const buffer=this.context.createBuffer(2,channels[0].length,decoded.sampleRate);channels.forEach((channel,i)=>buffer.copyToChannel(channel,i));
        const source=this.context.createBufferSource();source.buffer=buffer;source.playbackRate.value=Math.max(.75,Math.min(1.2,settings.rate));source.connect(this.context.destination);
        onSource('真人词典录音 · 居中双声道');
        await new Promise((resolve,reject)=>{this.stop=()=>{source.onended=null;source.stop();source.disconnect();reject(abortError());};source.onended=()=>{this.stop=null;source.disconnect();resolve();};source.start();onStart();});
        return;
      } catch(e) {if(generation!==this.generation||e.name==='AbortError')throw abortError();console.warn('真人录音暂不可用：',e.name,e.message);}
    }
    if(generation!==this.generation)throw abortError();
    onSource(settings.audioSource==='system'?'系统英语语音':'系统英语语音 · 真人录音不可用');
    await this.speakSystem(word,settings,onStart,generation);
  }
  speakSystem(word,settings,onStart,generation){
    if(!this.engine||!this.Utterance)return Promise.reject(new Error('没有可用的英语语音，请使用 Edge / Chrome 并安装英语语音。'));
    return new Promise((resolve,reject)=>{
      const voices=this.engine.getVoices(),lang=settings.accent==='uk'?'en-GB':'en-US';
      const utterance=new this.Utterance(word);
      utterance.voice=voices.find(v=>v.voiceURI===settings.voice)||voices.find(v=>v.lang===lang&&/Natural|Neural|Online/i.test(v.name))||voices.find(v=>v.lang===lang)||voices.find(v=>v.lang.startsWith('en'));
      utterance.lang=utterance.voice?.lang||lang;utterance.rate=settings.rate;
      let watchdog;
      const cleanup=()=>{clearTimeout(watchdog);this.stop=null;};
      this.stop=()=>{clearTimeout(watchdog);utterance.onend=null;utterance.onerror=null;this.engine.cancel();reject(abortError());};
      utterance.onstart=onStart;
      utterance.onerror=e=>{cleanup();reject(new Error(`语音播放失败（${e.error}），请更换英语语音后重试。`));};
      utterance.onend=()=>{clearTimeout(watchdog);this.stop=()=>reject(abortError());this.timer=setTimeout(()=>{cleanup();resolve();},300);};
      this.timer=setTimeout(()=>{if(generation!==this.generation)return reject(abortError());watchdog=setTimeout(()=>{this.engine.cancel();cleanup();reject(new Error('语音播放超时，请暂停后重试。'));},25000);this.engine.speak(utterance);},180);
      this.utterance=utterance;
    });
  }
}
export const pronunciation=new PronunciationService();
