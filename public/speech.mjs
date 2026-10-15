import { pronunciation } from './audio.mjs';
export const REPEAT_GAP_MS=180;
export class DictationPlayer {
  constructor(words,settings,onUpdate,onComplete,service=pronunciation){
    Object.assign(this,{words,settings,onUpdate,onComplete,service});
    this.index=0;this.repeat=0;this.phase='ready';this.paused=false;this.heard=new Set();this.token=0;this.remaining=settings.interval*1000;this.error='';this.audioLabel='';this.answers=new Map();this.submitted=new Set();
  }
  emit(){this.onUpdate(this);}
  clear(){clearInterval(this.timer);this.token++;this.service.cancel();}
  start(){this.service.unlock?.().catch(()=>{});this.speak();}
  async speak(){
    this.clear();this.paused=false;this.error='';this.phase='speaking';this.emit();const token=this.token;
    try {
      const playback=this.service.play(this.words[this.index].word,this.settings,()=>{if(token===this.token){this.heard.add(this.index);this.emit();}},label=>{if(token===this.token){this.audioLabel=label;this.emit();}});
      for(let offset=1;offset<=3;offset++)if(this.words[this.index+offset])this.service.prefetch?.(this.words[this.index+offset].word,this.settings);
      await playback;
      if(token!==this.token)return;
      this.heard.add(this.index);this.repeat++;
      if(this.repeat<this.settings.repeats)this.wait(REPEAT_GAP_MS,'repeat');
      else this.wait(this.settings.interval*1000,'writing');
    } catch(e){if(token!==this.token||e.name==='AbortError')return;this.clear();this.paused=true;this.error=e.message;this.emit();}
  }
  setAnswer(value){if(!this.submitted.has(this.index))this.answers.set(this.index,value);}
  submitAnswer(){this.submitted.add(this.index);this.emit();}
  editAnswer(){this.submitted.delete(this.index);this.emit();}
  wait(ms,phase){clearInterval(this.timer);this.phase=phase;this.remaining=ms;this.deadline=Date.now()+ms;this.emit();this.timer=setInterval(()=>{this.remaining=Math.max(0,this.deadline-Date.now());this.emit();if(this.remaining<=0){clearInterval(this.timer);if(phase==='repeat')this.speak();else this.next();}},100);}
  pause(){if(this.paused||this.phase==='done')return;this.remaining=Math.max(0,(this.deadline||Date.now())-Date.now());this.clear();this.paused=true;this.emit();}
  resume(){if(!this.paused)return;this.paused=false;if(this.phase==='writing'||this.phase==='repeat')this.wait(this.remaining,this.phase);else this.speak();}
  replay(){this.repeat=0;this.speak();}
  next(){this.submitAnswer();this.clear();this.repeat=0;if(this.index+1>=this.words.length)this.finish();else{this.index++;this.speak();}}
  finish(){this.submitAnswer();this.clear();this.phase='done';this.onComplete(this.words.flatMap((word,i)=>this.heard.has(i)?[{...word,answer:this.answers.get(i)||'',sequence:i}]:[]),this.settings.answerMode||'handwriting');}
  destroy(){this.clear();this.phase='done';}
}
