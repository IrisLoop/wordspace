import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageDimensions, improveContrast, adaptiveThreshold, pdfPageText, needsPageOCR, ocrDetails } from '../public/import-utils.mjs';
test('image preprocessing enlarges small text and bounds phone canvas memory', () => {
  assert.deepEqual(imageDimensions(600, 400), {width:1200,height:800});
  const size=imageDimensions(8000,6000);
  assert.ok(size.width*size.height<4010000);
  assert.ok(Math.max(size.width,size.height)<=3200);
  assert.throws(()=>imageDimensions(0,100),/尺寸无效/);
});
test('contrast enhancement handles gray print and white text on dark backgrounds', () => {
  const gray=new Uint8ClampedArray([70,70,70,255,240,240,240,255]);
  improveContrast(gray);assert.equal(gray[0],0);assert.equal(gray[4],255);
  const dark=new Uint8ClampedArray(Array.from({length:40},(_,i)=>i%4===3?255:i<32?20:230));
  improveContrast(dark);assert.equal(dark[0],255);assert.equal(dark[32],0);
});
test('PDF extraction preserves line breaks and normalizes ligatures; short headers do not hide scans', () => {
  assert.equal(pdfPageText([{str:'ofﬁce',hasEOL:true},{str:'progress'},{}]),'office\nprogress ');
  assert.equal(needsPageOCR('apple curiosity',false),false);
  assert.equal(needsPageOCR('Lesson one English vocabulary',true),true);
  assert.equal(needsPageOCR('',true),true);
});
test('local threshold preserves dark letters inside a gray scan on a white PDF page', () => {
  const pixels=new Uint8ClampedArray(60*60*4);
  for(let y=0;y<60;y++)for(let x=0;x<60;x++) {
    const i=(y*60+x)*4,gray=x>10&&x<50&&y>10&&y<50?210:255;
    pixels[i]=pixels[i+1]=pixels[i+2]=gray;pixels[i+3]=255;
  }
  const letter=(30*60+30)*4;pixels[letter]=pixels[letter+1]=pixels[letter+2]=30;
  adaptiveThreshold(pixels,60,60);
  assert.equal(pixels[letter],0);assert.equal(pixels[(32*60+32)*4],255);assert.equal(pixels[0],255);
});
test('uncertain OCR words are flagged without silently correcting their spelling', () => {
  const result=ocrDetails({text:'curiosity rnodel a1pha',confidence:90,blocks:[{paragraphs:[{lines:[{words:[{text:'curiosity',confidence:96},{text:'rnodel',confidence:55},{text:'a1pha',confidence:92}]}]}]}]});
  assert.equal(result.text,'curiosity rnodel a1pha');
  assert.ok(result.uncertain.includes('rnodel'));
  assert.ok(result.uncertain.includes('pha'));
  assert.ok(!result.uncertain.includes('curiosity'));
});
