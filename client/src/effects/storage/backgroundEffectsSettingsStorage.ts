import { BACKGROUND_EFFECTS_SETTINGS_STORAGE } from "../../shared/constants.js";

export const DEFAULT_BACKGROUND_EFFECTS_SETTINGS = {
	enabled: true,
	showStats: false,
	smoothingFactor: 0.8,
	smoothstepMin: 0.6,
	smoothstepMax: 0.9,
	smoothBorders: 0,
	backgroundBlur: 0,
	backgroundBlurRadius: 30,
	/** Zuletzt gewählter Kamera-Effekt ("none" | "blur" | Hintergrundbild-Id) — wird beim Join wieder angewendet. */
	backgroundEffectId: "none"
};

let cached = null;

function clampInt(v, min, max) {
	return Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
}

function clampFloat(v, min, max, precision = 2) {
	const n = Number(v);
	if (Number.isNaN(n)) return min;
	const clamped = Math.min(max, Math.max(min, n));
	const p = 10 ** precision;
	return Math.round(clamped * p) / p;
}

function sanitizePartial(o) {
	if (!o || typeof o !== "object") return {};
	const out = {};
	if (o.enabled !== undefined) out.enabled = !!o.enabled;
	if (o.showStats !== undefined) out.showStats = !!o.showStats;
	if (o.smoothingFactor !== undefined) out.smoothingFactor = clampFloat(o.smoothingFactor, 0.05, 0.95, 2);
	if (o.smoothstepMin !== undefined) out.smoothstepMin = clampFloat(o.smoothstepMin, 0, 1, 2);
	if (o.smoothstepMax !== undefined) out.smoothstepMax = clampFloat(o.smoothstepMax, 0, 1, 2);
	if (o.smoothBorders !== undefined) out.smoothBorders = clampFloat(o.smoothBorders, 0, 12, 1);
	if (o.backgroundBlur !== undefined) out.backgroundBlur = clampFloat(o.backgroundBlur, 0, 1, 2);
	if (o.backgroundBlurRadius !== undefined) out.backgroundBlurRadius = clampInt(o.backgroundBlurRadius, 0, 60);
	if (o.backgroundEffectId !== undefined) {
		const id = typeof o.backgroundEffectId === "string" ? o.backgroundEffectId.trim().slice(0, 200) : "";
		out.backgroundEffectId = id || "none";
	}
	/* Backward compatibility for already stored previous keys */
	if (o.maskTemporalMix !== undefined && out.smoothingFactor === undefined) {
		out.smoothingFactor = clampFloat(o.maskTemporalMix, 0.05, 0.95, 2);
	}
	if (o.maskFeatherPx !== undefined && out.smoothBorders === undefined) {
		out.smoothBorders = clampFloat(o.maskFeatherPx, 0, 12, 1);
	}
	if (o.blurAmount !== undefined && out.backgroundBlurRadius === undefined) {
		out.backgroundBlurRadius = clampInt(o.blurAmount, 0, 60);
	}
	if (o.segmentEveryNFrames !== undefined && out.backgroundBlur === undefined) {
		out.backgroundBlur = clampFloat(1 / clampInt(o.segmentEveryNFrames, 1, 4), 0, 1, 2);
	}
	return out;
}

function loadFromDisk() {
	try {
		const raw = localStorage.getItem(BACKGROUND_EFFECTS_SETTINGS_STORAGE);
		if (!raw) {
			cached = { ...DEFAULT_BACKGROUND_EFFECTS_SETTINGS };
			return;
		}
		const parsed = JSON.parse(raw);
		cached = { ...DEFAULT_BACKGROUND_EFFECTS_SETTINGS, ...sanitizePartial(parsed) };
	} catch {
		cached = { ...DEFAULT_BACKGROUND_EFFECTS_SETTINGS };
	}
}

export function readBackgroundEffectsSettings() {
	if (!cached) loadFromDisk();
	return { ...cached };
}

export function hydrateBackgroundEffectsSettingsFromStorage() {
	loadFromDisk();
	return readBackgroundEffectsSettings();
}

export function writeBackgroundEffectsSettings(partial) {
	const next = { ...readBackgroundEffectsSettings(), ...sanitizePartial(partial) };
	cached = next;
	try {
		localStorage.setItem(BACKGROUND_EFFECTS_SETTINGS_STORAGE, JSON.stringify(next));
	} catch (_) {}
	return next;
}

