import { OCR_MODEL_PATH, imageDimensions, improveContrast, adaptiveThreshold, ocrDetails } from './import-utils.mjs';
const resource = path => new URL(path, import.meta.url).href;
let engineScript;

async function loadEngine() {
  if (window.Tesseract) return window.Tesseract;
  if (!engineScript) engineScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = resource('vendor/tesseract.js/dist/tesseract.min.js');
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => { script.remove(); engineScript = undefined; reject(new Error('无法加载图片识别引擎，请检查网络后重试。')); };
    document.head.append(script);
  });
  return engineScript;
}

export async function prepareImage(input) {
  let image = input, url;
  if (input instanceof Blob) {
    url = URL.createObjectURL(input);
    image = new Image();
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('无法读取这张图片，请转为 JPG 或 PNG 后重试。'));
        image.src = url;
      });
    } catch (error) { URL.revokeObjectURL(url); throw error; }
  }
  try {
    const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
    if (width*height > 50000000) throw new Error('图片分辨率过大，请裁剪到文字区域后重新导入。');
    const size = imageDimensions(width, height), canvas = document.createElement('canvas');
    canvas.width = size.width+32; canvas.height = size.height+32;
    const ctx = canvas.getContext('2d', { willReadFrequently:true });
    ctx.fillStyle = '#fff';ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 16, 16, size.width, size.height);
    const pixels = ctx.getImageData(16, 16, size.width, size.height);
    improveContrast(pixels.data);ctx.putImageData(pixels, 16, 16);
    return canvas;
  } finally { if (url) URL.revokeObjectURL(url); }
}

// One worker per import batch; release its model memory when the batch finishes.
export function createOCR({ language = 'mixed' } = {}) {
  let worker, logger = () => {};
  async function getWorker() {
    if (worker) return worker;
    const engine = await loadEngine();
    logger('首次识图正在加载高精度模型，请保持页面打开…');
    worker = await engine.createWorker(language === 'english' ? 'eng' : ['eng', 'chi_sim'], 1, {
      workerPath:resource('vendor/tesseract.js/dist/worker.min.js'),
      corePath:resource('vendor/tesseract.js-core'),
      langPath:resource(OCR_MODEL_PATH),
      // HTTP cache can reuse model downloads without a second Safari IDB cache.
      cacheMethod:'none',
      errorHandler:() => {},
      logger:message => logger(message.status === 'recognizing text' ? `识别图片 ${Math.round(message.progress*100)}%` : `准备高精度模型 ${Math.round((message.progress || 0)*100)}%`)
    });
    await worker.setParameters({ tessedit_pageseg_mode:'3', user_defined_dpi:'300' });
    return worker;
  }
  return {
    async recognize(input, progress) {
      logger = progress;
      progress('放大文字、优化对比度…');
      const canvas = await prepareImage(input);
      try {
        const engine = await getWorker();
        let result = ocrDetails((await engine.recognize(canvas, { rotateAuto:true }, { text:true, blocks:true })).data);
        // Short vocabulary lists can be missed by automatic page segmentation.
        if (result.confidence < 80 || !result.text.trim()) {
          progress('正在复核模糊文字与单词列表…');
          const ctx=canvas.getContext('2d'),pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
          adaptiveThreshold(pixels.data,canvas.width,canvas.height);ctx.putImageData(pixels,0,0);
          const alternate = ocrDetails((await engine.recognize(canvas, { rotateAuto:true, tessedit_pageseg_mode:'6' }, { text:true, blocks:true })).data);
          if (alternate.text.trim() && alternate.confidence > result.confidence) result = alternate;
        }
        return result;
      } catch (error) {
        throw new Error('图片识别未完成，请检查网络；若图片较大，请裁剪到文字区域后重试。', { cause:error });
      } finally { canvas.width=0;canvas.height=0; }
    },
    async close() { const previous=worker;worker=undefined;await previous?.terminate(); }
  };
}
