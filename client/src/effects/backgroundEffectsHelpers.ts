/**
 * Helper functions for backgroundEffects.js (rule: ≤20 lines per function)
 */

/** Weight of new segmentation (0–1); higher = faster response, lower = calmer edges */
const MASK_TEMPORAL_MIX = 0.52;

/**
 * One state object per pipeline instance (closure); do not share globally.
 * @returns {{ smoothAlpha: Float32Array|null; mw: number; mh: number }}
 */
export function createMaskTemporalState() {
	return { smoothAlpha: null, mw: 0, mh: 0 };
}

function buildSmoothedPersonMask(maskArray, mw, mh, state, temporalMix = MASK_TEMPORAL_MIX) {
	const n = mw * mh;
	if (!maskArray || maskArray.length !== n) return null;
	if (!state.smoothAlpha || state.mw !== mw || state.mh !== mh) {
		state.smoothAlpha = new Float32Array(n);
		state.mw = mw;
		state.mh = mh;
		for (let i = 0; i < n; i++) {
			state.smoothAlpha[i] = Math.min(255, Math.max(0, Number(maskArray[i]) || 0));
		}
	} else {
		const mix = Math.min(0.95, Math.max(0.05, Number(temporalMix) || MASK_TEMPORAL_MIX));
		const inv = 1 - mix;
		for (let i = 0; i < n; i++) {
			const target = Math.min(255, Math.max(0, Number(maskArray[i]) || 0));
			state.smoothAlpha[i] = state.smoothAlpha[i] * inv + target * mix;
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

/** @param {object} result – MediaPipe segmentForVideo result with categoryMask */
function smoothstep(edge0, edge1, x) {
	const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(0.0001, edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

export function categoryMaskToImageData(result, temporalState, options = {}) {
	if (!result?.categoryMask || !temporalState) return null;
	const mask = result.categoryMask;
	const temporalMix = options?.temporalMix ?? MASK_TEMPORAL_MIX;
	const smoothstepMin = Math.max(0, Math.min(1, Number(options?.smoothstepMin ?? 0.6)));
	const smoothstepMax = Math.max(smoothstepMin + 0.01, Math.min(1, Number(options?.smoothstepMax ?? 0.9)));
	const mw = mask.width;
	const mh = mask.height;
	const n = mw * mh;
	const category = mask.getAsUint8Array();
	const confidence = result?.confidenceMasks?.[0]?.getAsFloat32Array?.() ?? null;
	const personAlpha = new Uint8Array(n);
	for (let i = 0; i < n; i++) {
		/* confidenceMasks[0] is background confidence for selfie_multiclass; convert to person confidence. */
		const personConfidence = confidence ? 1 - Math.max(0, Math.min(1, Number(confidence[i]) || 0)) : category[i] === 0 ? 0 : 1;
		personAlpha[i] = Math.round(255 * smoothstep(smoothstepMin, smoothstepMax, personConfidence));
	}
	return buildSmoothedPersonMask(personAlpha, mw, mh, temporalState, temporalMix);
}

/**
 * Draw person with soft mask at full resolution; edge feather scales with width.
 */
export function drawPersonWithMask(personCtx, maskCtx, maskCanvas, videoFrame, lastMaskImageData, w, h, featherPx = null) {
	personCtx.imageSmoothingEnabled = true;
	personCtx.imageSmoothingQuality = "high";
	personCtx.clearRect(0, 0, w, h);
	personCtx.drawImage(videoFrame, 0, 0, w, h);
	maskCtx.putImageData(lastMaskImageData, 0, 0);
	personCtx.globalCompositeOperation = "destination-in";
	const feather = featherPx == null ? Math.max(3.5, Math.min(8, w / 180)) : Math.max(2, Math.min(12, Number(featherPx)));
	personCtx.filter = `blur(${feather}px)`;
	personCtx.drawImage(maskCanvas, 0, 0, w, h);
	personCtx.filter = "none";
	personCtx.globalCompositeOperation = "source-over";
}

export function drawBlurBackground(blurCtx, videoFrame, w, h, blurAmount) {
	blurCtx.clearRect(0, 0, w, h);
	blurCtx.drawImage(videoFrame, 0, 0, w, h);
	blurCtx.filter = `blur(${blurAmount}px)`;
	blurCtx.drawImage(videoFrame, 0, 0, w, h);
	blurCtx.filter = "none";
}

