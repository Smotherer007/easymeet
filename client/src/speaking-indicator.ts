import { getSpeakingThreshold } from "./effects/storage/audioSettingsStorage.js";
import { createDbfsReader, createMeterAnalyser, speakingThresholdToDbfs } from "./effects/audio/levelMeter.js";
import { getSharedAudioContext, resumeSharedAudioContext } from "./effects/audio/audioContext.js";

/** Keep the highlight on this long after the last active frame (same feel as the mic gate). */
const HOLD_MS = 220;
const stopCallbacks = new Map();

function streamHasLiveAudio(stream) {
	return !!stream?.getAudioTracks?.().some((t) => t.readyState === "live");
}

/**
 * Level meter for one peer. Ends any previous session for the same peerId so a later call
 * with a real mic (after an empty initial stream) takes effect.
 */
export function startSpeakingIndicator(peerId, stream, container) {
	stopSpeakingIndicator(peerId);
	if (!streamHasLiveAudio(stream)) {
		return () => {};
	}
	let ctx,
		source,
		analyser,
		readDbfs,
		rafId,
		lastSpeaking = false,
		/* -Infinity: right after page load `performance.now()` is small, 0 would read as "just spoke". */
		lastActiveTs = -Infinity,
		cancelled = false;
	try {
		/* Shared context: one per peer meant one Chrome output stream per peer in the audio graph. */
		ctx = getSharedAudioContext();
		if (!ctx) return () => {};
		resumeSharedAudioContext();
		source = ctx.createMediaStreamSource(stream);
		analyser = createMeterAnalyser(ctx);
		readDbfs = createDbfsReader(analyser);
		source.connect(analyser);
	} catch (err) {
		return () => {};
	}

	function update() {
		if (cancelled || !analyser || !container) return;
		/* RMS in dBFS — a spectrum average over all bins reads far too low on virtual/loopback
		 * devices, which is why they never lit up here. See effects/audio/levelMeter.js. */
		const db = readDbfs();
		const now = performance.now();
		if (db >= speakingThresholdToDbfs(getSpeakingThreshold())) lastActiveTs = now;
		const speaking = now - lastActiveTs < HOLD_MS;
		if (speaking !== lastSpeaking) {
			lastSpeaking = speaking;
			// Highlight sidebar participant
			const el = container.querySelector(`.voip-view__participant[data-peer-id="${peerId}"]`);
			if (el) el.classList.toggle("voip-view__participant--speaking", speaking);
			// Highlight video gallery tile
			const tile = container.querySelector(`.video-tile[data-peer-id="${peerId}"]`);
			if (tile) tile.classList.toggle("video-tile--speaking", speaking);
		}
		rafId = requestAnimationFrame(update);
	}
	rafId = requestAnimationFrame(update);

	function stop() {
		cancelled = true;
		if (rafId) cancelAnimationFrame(rafId);
		try {
			source?.disconnect();
			analyser?.disconnect();
		} catch (_) {}
		source = null;
		analyser = null;
		readDbfs = null;
		ctx = null;
		stopCallbacks.delete(peerId);
		const el = container?.querySelector(`.voip-view__participant[data-peer-id="${peerId}"]`);
		if (el) el.classList.remove("voip-view__participant--speaking");
		const tile = container?.querySelector(`.video-tile[data-peer-id="${peerId}"]`);
		if (tile) tile.classList.remove("video-tile--speaking");
	}
	stopCallbacks.set(peerId, stop);
	return stop;
}

export function stopSpeakingIndicator(peerId) {
	const stop = stopCallbacks.get(peerId);
	if (stop) stop();
}

export function cleanupAllSpeakingIndicators() {
	stopCallbacks.forEach((stop) => stop());
	stopCallbacks.clear();
}
