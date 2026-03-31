/**
 * Persistent audio / microphone settings (localStorage).
 */

import { AUDIO_SETTINGS_STORAGE } from "../../shared/constants.js";

export const DEFAULT_AUDIO_SETTINGS = {
	/** Speaking gate: same threshold as UI indicator; outgoing mic is attenuated below this level (~5–50). */
	speakingThreshold: 15,
	noiseSuppression: true,
	echoCancellation: true,
	autoGainControl: false
};

/** @type {typeof DEFAULT_AUDIO_SETTINGS | null} */
let cached = null;

function sanitizePartial(o) {
	if (!o || typeof o !== "object") return {};
	const out = {};
	if (typeof o.speakingThreshold === "number" && !Number.isNaN(o.speakingThreshold)) {
		out.speakingThreshold = Math.min(50, Math.max(5, Math.round(o.speakingThreshold)));
	}
	for (const k of ["noiseSuppression", "echoCancellation", "autoGainControl"]) {
		if (typeof o[k] === "boolean") out[k] = o[k];
	}
	return out;
}

function loadFromDisk() {
	try {
		const raw = localStorage.getItem(AUDIO_SETTINGS_STORAGE);
		if (!raw) {
			cached = { ...DEFAULT_AUDIO_SETTINGS };
			return;
		}
		const o = JSON.parse(raw);
		cached = { ...DEFAULT_AUDIO_SETTINGS, ...sanitizePartial(o) };
	} catch {
		cached = { ...DEFAULT_AUDIO_SETTINGS };
	}
}

/** Read from cache or disk (first call). */
export function readAudioSettings() {
	if (!cached) loadFromDisk();
	return { ...cached };
}

/** For bootstrap: populate cache and return settings object. */
export function hydrateAudioSettingsFromStorage() {
	loadFromDisk();
	return readAudioSettings();
}

/**
 * @param {Partial<typeof DEFAULT_AUDIO_SETTINGS>} partial
 * @returns {typeof DEFAULT_AUDIO_SETTINGS}
 */
export function writeAudioSettings(partial) {
	const cur = readAudioSettings();
	const next = { ...cur };
	if (partial.speakingThreshold !== undefined) {
		const v = Number(partial.speakingThreshold);
		if (!Number.isNaN(v)) next.speakingThreshold = Math.min(50, Math.max(5, Math.round(v)));
	}
	for (const k of ["noiseSuppression", "echoCancellation", "autoGainControl"]) {
		if (partial[k] !== undefined) next[k] = !!partial[k];
	}
	cached = next;
	try {
		localStorage.setItem(AUDIO_SETTINGS_STORAGE, JSON.stringify(next));
	} catch (_) {
		/* ignore */
	}
	return next;
}

export function getSpeakingThreshold() {
	return readAudioSettings().speakingThreshold;
}

/** Visible slider and stored threshold (5–50): lower = more sensitive. */
export const SPEAKING_THRESHOLD_UI_MIN = 5;
export const SPEAKING_THRESHOLD_UI_MAX = 50;

/**
 * Sensitivity 10–100% for settings UI: 100% = very sensitive (internally low threshold), 10% = strict (internally high).
 * @param {number} threshold
 * @returns {number}
 */
export function speakingThresholdToSensitivityPercent(threshold) {
	const v = Math.min(
		SPEAKING_THRESHOLD_UI_MAX,
		Math.max(SPEAKING_THRESHOLD_UI_MIN, Math.round(Number(threshold) || DEFAULT_AUDIO_SETTINGS.speakingThreshold))
	);
	return Math.round(
		10 + (90 * (SPEAKING_THRESHOLD_UI_MAX - v)) / (SPEAKING_THRESHOLD_UI_MAX - SPEAKING_THRESHOLD_UI_MIN)
	);
}

/** For getUserMedia audio constraints (without deviceId). */
export function getAudioProcessingConstraints() {
	const s = readAudioSettings();
	return {
		noiseSuppression: !!s.noiseSuppression,
		echoCancellation: !!s.echoCancellation,
		autoGainControl: !!s.autoGainControl
	};
}
