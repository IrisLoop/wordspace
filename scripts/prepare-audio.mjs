// Public Creative Commons pronunciations for an offline starter vocabulary.
// Run manually; the checked-in index preserves attribution and original licenses.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const words=`a able about achieve across action activity add after again all also always an and answer any apple are around as ask at away back bad banana be beautiful because become before begin believe best better between big book both bring build but buy by call can change child city clear come confidence consistent consider could country create curiosity day different do does don't down each early easy education effect end english enough even every example experience fact family feel few find first focus follow for form friend from get give go good great group grow hand happy hard have he head hear hello help her here high him his home hope house how however i idea if important improve in include information into is it its just keep kind know language large last late later learn learning leave left let life light like line little live long look love made make man many may me mean might mind more morning most mother move much must my name natural need never new next no not now number of off often old on once one only open or order other our out over own part people person place plan play point possible practice present problem process progress provide question quite read really reason recognize remember resilience result right run same say school science see seem she should show small so some something sound speak start state still story student study subtle such take teach tell than that the their them then there these they thing think this those thought thoughtful three through time to today together too try turn two under understand up us use value very want was watch water way we well went were what when where which while white who why will with without word work world would write year yes yet you young your perspective opportunity assumption`.split(/\s+/);
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'public/assets/audio');
export async function prepareAudio(fetcher=fetch,onProgress=console.log){
  await mkdir(out,{recursive:true});let index={};try{index=JSON.parse(await readFile(path.join(out,'index.json'),'utf8'));}catch{}
  for(let start=0;start<words.length;start+=25){
    const query=new URLSearchParams({action:'query',titles:words.slice(start,start+25).map(w=>`File:En-us-${w}.ogg`).join('|'),prop:'imageinfo',iiprop:'url|extmetadata',format:'json'});
    try{
      const response=await fetcher(`https://commons.wikimedia.org/w/api.php?${query}`,{signal:AbortSignal.timeout(12000)});if(response.status===429){onProgress('Source rate limit reached; stop and retry later.');break;}if(!response.ok)throw new Error(`Metadata ${response.status}`);
      const data=await response.json(),pages=Object.values(data.query?.pages||{});let cursor=0;
      async function worker(){while(cursor<pages.length){const page=pages[cursor++],info=page.imageinfo?.[0];if(!info)continue;
        const word=page.title.replace(/^File:En-us-/,'').replace(/\.ogg$/,'');if(index[`us:${word}`])continue;
        const license=info.extmetadata?.LicenseUrl?.value?.replace(/^http:/,'https:');
        if(!license?.startsWith('https://creativecommons.org/'))continue;
        try{const audio=await fetcher(info.url,{signal:AbortSignal.timeout(12000)});if(!audio.ok)throw new Error(`Audio ${audio.status}`);
          const file=`us-${word}.ogg`;await writeFile(path.join(out,file),new Uint8Array(await audio.arrayBuffer()));
          index[`us:${word}`]={file,source:info.descriptionurl,license,licenseName:info.extmetadata?.LicenseShortName?.value||'Creative Commons',author:info.extmetadata?.Artist?.value?.replace(/<[^>]*>/g,'').slice(0,200)||'',audio:info.url};
        }catch(e){onProgress(`${word}: ${e.message}`);}
      }}
      await Promise.all([worker(),worker()]);
    }catch(e){onProgress(`Batch ${start}: ${e.message}`);}
    onProgress(`${Math.min(start+25,words.length)}/${words.length} processed, ${Object.keys(index).length} recordings`);
  }
  await writeFile(path.join(out,'index.json'),JSON.stringify(index,null,2));
  onProgress(`${Object.keys(index).length} recordings with attribution saved.`);return Object.keys(index).length;
}
if(typeof process!=='undefined'&&process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename)await prepareAudio();
