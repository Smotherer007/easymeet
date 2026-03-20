/**
 * Helper functions for backgroundEffects.js (rule: ≤20 lines per function)
 */

export function categoryMaskToImageData(result) {
  if (!result.categoryMask) return null;
  const maskArray = result.categoryMask.getAsUint8Array();
  const mw = result.categoryMask.width;
  const mh = result.categoryMask.height;
  const imgData = new ImageData(mw, mh);
  const data = imgData.data;
  for (let i = 0; i < maskArray.length; i++) {
    const alpha = maskArray[i] === 0 ? 0 : 255;
    const c = i * 4;
    data[c] = 255;
    data[c + 1] = 255;
    data[c + 2] = 255;
    data[c + 3] = alpha;
  }
  return imgData;
}

export function drawPersonWithMask(personCtx, maskCtx, maskCanvas, videoFrame, lastMaskImageData, w, h) {
  personCtx.clearRect(0, 0, w, h);
  personCtx.drawImage(videoFrame, 0, 0, w, h);
  maskCtx.putImageData(lastMaskImageData, 0, 0);
  personCtx.globalCompositeOperation = 'destination-in';
  personCtx.filter = 'blur(4px)';
  personCtx.drawImage(maskCanvas, 0, 0, w, h);
  personCtx.filter = 'none';
  personCtx.globalCompositeOperation = 'source-over';
}

export function drawBlurBackground(blurCtx, videoFrame, w, h, blurAmount) {
  blurCtx.clearRect(0, 0, w, h);
  blurCtx.drawImage(videoFrame, 0, 0, w, h);
  blurCtx.filter = `blur(${blurAmount}px)`;
  blurCtx.drawImage(videoFrame, 0, 0, w, h);
  blurCtx.filter = 'none';
}

