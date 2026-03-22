import { getSpeakingThreshold } from "./effects/storage/audioSettingsStorage.js";

const SMOOTHING = 0.7;
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
		dataArray,
		rafId,
		lastSpeaking = false,
		cancelled = false;
	try {
		ctx = new (window.AudioContext || window.webkitAudioContext)();
		source = ctx.createMediaStreamSource(stream);
		analyser = ctx.createAnalyser();
		analyser.fftSize = 256;
		analyser.smoothingTimeConstant = SMOOTHING;
		source.connect(analyser);
	} catch (err) {
		return () => {};
	}
	const bufferLength = analyser.frequencyBinCount;
	dataArray = new Uint8Array(bufferLength);

	function update() {
		if (cancelled || !analyser || !container) return;
		analyser.getByteFrequencyData(dataArray);
		const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
		const speaking = avg > getSpeakingThreshold();
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
			ctx?.close();
		} catch (_) {}
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
