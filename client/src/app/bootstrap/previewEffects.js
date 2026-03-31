/**
 * Background effects for preview (composition root — dispatch only, no patchState).
 */

import { createBlurredStream, createVirtualBackgroundStream, isSupported as isBackgroundEffectsSupported, BACKGROUND_IMAGES } from "../../effects/backgroundEffects.js";
import { getCustomBackgrounds } from "../../effects/storage/customBackgroundStorage.js";
import * as selectors from "../../domain/selectors/index.js";

/**
 * @param {import('../../store/index.js').getState} getState
 * @param {import('../../store/index.js').dispatch} dispatch
 */
export function createApplyEffectToPreview(getState, dispatch) {
	return async function applyEffectToPreview(appEl, sourceStream, effect, previewVideo) {
		if (!previewVideo || !sourceStream?.getVideoTracks?.().length) return;
		const loadingEl = appEl.querySelector("#effect-preview-loading");
		const showLoading = () => loadingEl?.removeAttribute("hidden");
		const hideLoading = () => loadingEl?.setAttribute("hidden", "");
		try {
			selectors.selectPreviewEffectStop(getState())?.();
		} catch (_) {}
		dispatch({ type: "effects/previewEffectStop", payload: { stop: null } });
		if (effect === "blur" && isBackgroundEffectsSupported()) {
			await applyBlurEffect(dispatch, sourceStream, previewVideo, showLoading, hideLoading);
		} else if (effect && effect !== "none" && isBackgroundEffectsSupported()) {
			await applyVirtualBackgroundEffect(dispatch, sourceStream, effect, previewVideo, showLoading, hideLoading);
		} else {
			previewVideo.srcObject = sourceStream;
		}
	};
}

/**
 * @param {import('../../store/index.js').dispatch} dispatch
 */
async function applyBlurEffect(dispatch, sourceStream, previewVideo, showLoading, hideLoading) {
	showLoading();
	try {
		const { stream, stop } = await createBlurredStream(sourceStream, { blurAmount: 15 });
		previewVideo.srcObject = stream;
		dispatch({ type: "effects/previewEffectStop", payload: { stop } });
	} catch {
		previewVideo.srcObject = sourceStream;
	} finally {
		hideLoading();
	}
}

/**
 * @param {import('../../store/index.js').dispatch} dispatch
 */
async function applyVirtualBackgroundEffect(dispatch, sourceStream, effect, previewVideo, showLoading, hideLoading) {
	const customResult = getCustomBackgrounds();
	const allBackgrounds = [...BACKGROUND_IMAGES, ...(customResult.success ? customResult.data : [])];
	const bg = allBackgrounds.find((b) => b.id === effect);
	if (!bg?.url) {
		previewVideo.srcObject = sourceStream;
		return;
	}
	showLoading();
	try {
		const { stream, stop } = await createVirtualBackgroundStream(sourceStream, bg.url);
		previewVideo.srcObject = stream;
		dispatch({ type: "effects/previewEffectStop", payload: { stop } });
	} catch {
		previewVideo.srcObject = sourceStream;
	} finally {
		hideLoading();
	}
}
