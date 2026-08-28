/**
 * Hydration aus localStorage / deviceStorage beim Start.
 */

import { VIDEO_LAYOUT_STORAGE, WINDOW_POSITIONS_STORAGE } from "../../shared/constants.js";
import { mergeAndClampAllWindowPositions } from "../../ui/utils/viewportWindowClamp.js";
import { hydrateAudioSettingsFromStorage } from "../../effects/storage/audioSettingsStorage.js";
import { hydrateBackgroundEffectsSettingsFromStorage } from "../../effects/storage/backgroundEffectsSettingsStorage.js";

/**
 * @param {import('../../store/index.js').dispatch} dispatch
 * @param {typeof import('../../effects/storage/deviceStorage.js').readDeviceIds} readDeviceIds
 * @param {typeof import('../../effects/storage/deviceStorage.js').readPeerVolumes} readPeerVolumes
 */
export function initFromStorage(dispatch, readDeviceIds, readPeerVolumes) {
	loadDeviceIdsFromStorage(dispatch, readDeviceIds);
	dispatch({
		type: "storage/audioSettingsRestored",
		payload: { audioSettings: hydrateAudioSettingsFromStorage() }
	});
	/* Gemerkten Kamera-Effekt beim Start wiederherstellen (wie Audio-/Geräteeinstellungen). */
	const bgSettings = hydrateBackgroundEffectsSettingsFromStorage();
	dispatch({
		type: "storage/backgroundEffectsSettingsRestored",
		payload: { backgroundEffectsSettings: bgSettings }
	});
	if (bgSettings.backgroundEffectId && bgSettings.backgroundEffectId !== "none") {
		dispatch({ type: "media/backgroundEffectSet", payload: { effect: bgSettings.backgroundEffectId } });
	}
	const volumes = readPeerVolumes();
	if (Object.keys(volumes).length > 0) {
		dispatch({ type: "peer/volumesMerged", payload: { volumes } });
	}
	loadLayoutFromStorage(dispatch);
}

/**
 * @param {import('../../store/index.js').dispatch} dispatch
 * @param {() => import('../../shared/result.js').Result<{ input?: string; output?: string; video?: string }>} readDeviceIds
 */
function loadDeviceIdsFromStorage(dispatch, readDeviceIds) {
	const devResult = readDeviceIds();
	if (devResult.success && devResult.data && (devResult.data.input || devResult.data.output || devResult.data.video)) {
		dispatch({
			type: "storage/devicesRestored",
			payload: {
				inputDeviceId: devResult.data.input,
				outputDeviceId: devResult.data.output,
				videoDeviceId: devResult.data.video
			}
		});
	}
}

/**
 * @param {import('../../store/index.js').dispatch} dispatch
 */
function loadLayoutFromStorage(dispatch) {
	try {
		const layout = localStorage.getItem(VIDEO_LAYOUT_STORAGE);
		let mode = layout === "free" || layout === "grid" ? layout : null;
		if (mode === "free" && typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches) {
			mode = "grid";
		}
		if (mode) {
			dispatch({ type: "storage/videoLayoutRestored", payload: { videoLayoutMode: mode } });
		}
		const stored = localStorage.getItem(WINDOW_POSITIONS_STORAGE);
		if (stored) {
			try {
				const raw = JSON.parse(stored);
				if (raw && typeof raw === "object") {
					const pos = mergeAndClampAllWindowPositions(raw);
					dispatch({ type: "storage/windowPositionsRestored", payload: { windowPositions: pos } });
					try {
						localStorage.setItem(WINDOW_POSITIONS_STORAGE, JSON.stringify(pos));
					} catch (_) {}
				}
			} catch (_) {}
		}
	} catch (_) {}
}
