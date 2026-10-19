import { extractWords } from './core.mjs';

export const OCR_MODEL_PATH = 'assets/ocr/best-v1';
export const PDF_BUILD_PATH = 'vendor/pdfjs-dist/legacy/build/';

export function imageDimensions(width, height, maxPixels = 4000000) {
  if (!(width > 0 && height > 0)) throw new Error('图片尺寸无效，请重新选择图片。');
  const scale = Math.min(2, 1600 / Math.min(width, height), 3200 / Math.max(width, height), Math.sqrt(maxPixels / (width * height)));
  return { width:Math.max(1, Math.round(width * scale)), height:Math.max(1, Math.round(height * scale)) };
}

export function improveContrast(pixels) {
  const histogram = new Uint32Array(256);
  for (let i=0; i<pixels.length; i+=4) {
    const gray = Math.round(pixels[i]*0.299 + pixels[i+1]*0.587 + pixels[i+2]*0.114);
    histogram[gray]++;
  }
  const count = pixels.length / 4;
  const percentile = fraction => {
    let sum = 0;
    for (let i=0; i<256; i++) { sum+=histogram[i]; if (sum>=count*fraction) return i; }
    return 255;
  };
  const low = percentile(0.01), high = percentile(0.99);
  const invert = percentile(0.6) < 100 && high > 150;
  for (let i=0; i<pixels.length; i+=4) {
    let gray = Math.round(pixels[i]*0.299 + pixels[i+1]*0.587 + pixels[i+2]*0.114);
    if (high-low > 30) gray = Math.max(0, Math.min(255, (gray-low)*255/(high-low)));
    if (invert) gray = 255-gray;
    pixels[i] = pixels[i+1] = pixels[i+2] = gray;
    pixels[i+3] = 255;
  }
  return pixels;
}

// Local thresholds separate text from gray paper/shadows inside a white PDF page.
// A global threshold can mistake the entire scan rectangle for one black shape.
export function adaptiveThreshold(pixels, width, height) {
  const stride=width+1, sums=new Uint32Array(stride*(height+1));
  for(let y=0;y<height;y++) {
    let row=0;
    for(let x=0;x<width;x++) {row+=pixels[(y*width+x)*4];sums[(y+1)*stride+x+1]=sums[y*stride+x+1]+row;}
  }
  const radius=Math.max(12,Math.min(32,Math.round(width/80)));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const left=Math.max(0,x-radius),right=Math.min(width,x+radius+1),top=Math.max(0,y-radius),bottom=Math.min(height,y+radius+1);
    const mean=(sums[bottom*stride+right]-sums[top*stride+right]-sums[bottom*stride+left]+sums[top*stride+left])/((right-left)*(bottom-top));
    const i=(y*width+x)*4,value=pixels[i]<mean-10?0:255;
    pixels[i]=pixels[i+1]=pixels[i+2]=value;
  }
  return pixels;
}

export const normalizeImportText = text => text.normalize('NFKC').replace(/\u00ad/g, '').replace(/\uFFFD/g, ' ');
export function pdfPageText(items) {
  return normalizeImportText(items.map(item => typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '').join(''));
}
export function needsPageOCR(text, hasImages = false) {
  const letters = (text.match(/[a-z]/gi) || []).length;
  return letters < 2 || (hasImages && extractWords(text).length < 50);
}
export function ocrDetails(data) {
  const uncertain = new Set();
  const text = normalizeImportText(data.text || '');
  const words = (data.blocks || []).flatMap(block => (block.paragraphs || []).flatMap(p => (p.lines || []).flatMap(line => line.words || [])));
  for (const word of words) {
    if (word.confidence < 85 || /[a-z][0-9]|[0-9][a-z]/i.test(word.text)) {
      extractWords(normalizeImportText(word.text)).forEach(token => uncertain.add(token));
    }
  }
  if (!words.length || data.confidence < 65) extractWords(text).forEach(token => uncertain.add(token));
  return { text, uncertain:[...uncertain], confidence:Number(data.confidence) || 0 };
}
