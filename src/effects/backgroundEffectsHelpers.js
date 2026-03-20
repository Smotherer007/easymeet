/**
 * Helper functions for backgroundEffects.js (rule: ≤20 lines per function)
 */

/** Anteil neuer Segmentierung (0–1); höher = schneller reagierend, niedriger = ruhigere Kanten */
const MASK_TEMPORAL_MIX = 0.52;

/**
 * Pro Pipeline-Instanz ein State-Objekt (Closure), nicht global teilen.
 * @returns {{ smoothAlpha: Float32Array|null; mw: number; mh: number }}
 */
export function createMaskTemporalState() {
  return { smoothAlpha: null, mw: 0, mh: 0 };
}

function buildSmoothedPersonMask(maskArray, mw, mh, state) {
  const n = mw * mh;
  if (!maskArray || maskArray.length !== n) return null;
  if (!state.smoothAlpha || state.mw !== mw || state.mh !== mh) {
    state.smoothAlpha = new Float32Array(n);
    state.mw = mw;
    state.mh = mh;
    for (let i = 0; i < n; i++) {
      state.smoothAlpha[i] = maskArray[i] === 0 ? 0 : 255;
    }
  } else {
    const inv = 1 - MASK_TEMPORAL_MIX;
    for (let i = 0; i < n; i++) {
      const target = maskArray[i] === 0 ? 0 : 255;
      state.smoothAlpha[i] = state.smoothAlpha[i] * inv + target * MASK_TEMPORAL_MIX;
    }
  }
  const imgData = new ImageData(mw, mh);
  const d = imgData.data;
  for (let i = 0; i < n; i++) {
    const a = Math.min(255, Math.max(0, Math.round(state.smoothAlpha[i])));
    const c = i * 4;
    d[c] = 255;
    d[c + 1] = 255;
    d[c + 2] = 255;
    d[c + 3] = a;
  }
  return imgData;
}

/** @param {object} result – MediaPipe segmentForVideo-Ergebnis mit categoryMask */
export function categoryMaskToImageData(result, temporalState) {
  if (!result?.categoryMask || !temporalState) return null;
  const mask = result.categoryMask;
  return buildSmoothedPersonMask(mask.getAsUint8Array(), mask.width, mask.height, temporalState);
}

/**
 * Person mit weicher Maske auf volle Auflösung; Kanten-Glättung skaliert mit Breite.
 */
export function drawPersonWithMask(personCtx, maskCtx, maskCanvas, videoFrame, lastMaskImageData, w, h) {
  personCtx.imageSmoothingEnabled = true;
  personCtx.imageSmoothingQuality = 'high';
  personCtx.clearRect(0, 0, w, h);
  personCtx.drawImage(videoFrame, 0, 0, w, h);
  maskCtx.putImageData(lastMaskImageData, 0, 0);
  personCtx.globalCompositeOperation = 'destination-in';
  const feather = Math.max(3.5, Math.min(8, w / 180));
  personCtx.filter = `blur(${feather}px)`;
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

/** Virtuelles Hintergrundmotiv horizontal spiegeln (Person bleibt unverändert). */
export function drawImageHorizontallyFlipped(ctx, image, w, h) {
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(image, 0, 0, w, h);
  ctx.restore();
}
