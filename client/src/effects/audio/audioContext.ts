/**
 * One AudioContext for the whole app.
 *
 * Chrome opens a hardware output stream per `AudioContext` — even for a context that only renders
 * into a `MediaStreamDestination` and never reaches a speaker. With one context per peer (speaking
 * indicator) plus one for the mic gate plus one for notification tones, a PipeWire/JACK graph fills
 * up with Chrome outputs that carry nothing. Everything shares this one instead.
 *
 * It is created lazily (autoplay policy: a context created before the first gesture starts
 * "suspended") and closed when the room is torn down.
 */

/** @type {AudioContext | null} */
let ctx = null;
/** Last sink id handed to setSinkId — avoids redundant switches. */
let appliedSinkId = null;

/**
 * Shared context, created on first use.
 * @returns {AudioContext | null}
 */
export function getSharedAudioContext() {
	if (!ctx && typeof window !== "undefined") {
		const AC = window.AudioContext || window.webkitAudioContext;
		if (AC) ctx = new AC();
	}
	return ctx;
}

/** Existing context without creating one. */
export function peekSharedAudioContext() {
	return ctx;
}

/** Autoplay policy: contexts start suspended until a user gesture. */
export function resumeSharedAudioContext() {
	if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
}

/**
 * Route the shared context to the selected output device (Chromium ≥ 110; ignored elsewhere).
 * Without this the notification tones always went to the system default while `<audio>` elements
 * already followed the picker.
 * @param {string} deviceId
 */
export function applySharedAudioContextSink(deviceId) {
	const c = ctx;
	const wanted = deviceId || "";
	if (!c || typeof c.setSinkId !== "function" || appliedSinkId === wanted) return;
	appliedSinkId = wanted;
	try {
		void Promise.resolve(c.setSinkId(wanted)).catch(() => {
			appliedSinkId = null;
		});
	} catch (_) {
		appliedSinkId = null;
	}
}

/** Session teardown — frees the output stream; the next use creates a fresh context. */
export function closeSharedAudioContext() {
	try {
		void ctx?.close();
	} catch (_) {}
	ctx = null;
	appliedSinkId = null;
}
