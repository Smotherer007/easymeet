/**
 * Attenuate quiet audio below speakingThreshold (Web Audio), same metric as speaking-indicator.js.
 * Raw mic stays only in this pipeline; localStream carries the output track for WebRTC + UI.
 */

import { getSpeakingThreshold } from "../storage/audioSettingsStorage.js";

const FFT_SIZE = 256;
const SMOOTHING = 0.7;
const ATTACK = 0.28;
const RELEASE = 0.12;

let ctx = null;
let sourceNode = null;
let analyser = null;
let gainNode = null;
let dest = null;
/** @type {MediaStreamTrack | null} */
let outputTrack = null;
/** @type {MediaStreamTrack | null} */
let rawInputTrack = null;
let rafId = 0;
let loopOn = false;
/** @type {Uint8Array | null} */
let dataArray = null;
let currentGain = 0;
let visibilityListenerAttached = false;

function disconnectSource() {
	try {
		sourceNode?.disconnect();
	} catch (_) {}
	sourceNode = null;
}

function stopLoop() {
	if (rafId) cancelAnimationFrame(rafId);
	rafId = 0;
	loopOn = false;
}

function onVisibilityChange() {
	if (!gainNode) return;
	if (document.hidden) {
		/* Background tabs can throttle/pause RAF. Keep mic transmission alive by
		 * forcing pass-through while hidden instead of freezing at gain=0. */
		currentGain = 1;
		gainNode.gain.value = 1;
		return;
	}
	resumeCtx();
	if (!loopOn && analyser && dataArray) {
		loopOn = true;
		rafId = requestAnimationFrame(runMeterLoop);
	}
}

function runMeterLoop() {
	if (!loopOn || !analyser || !gainNode) return;
	analyser.getByteFrequencyData(dataArray);
	let sum = 0;
	for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
	const avg = sum / dataArray.length;
	const speaking = avg > getSpeakingThreshold();
	const target = speaking ? 1 : 0;
	const k = target > currentGain ? ATTACK : RELEASE;
	currentGain += (target - currentGain) * k;
	if (currentGain < 0.002) currentGain = 0;
	if (currentGain > 0.998) currentGain = 1;
	gainNode.gain.value = currentGain;
	rafId = requestAnimationFrame(runMeterLoop);
}

function ensureGraph() {
	if (ctx) return;
	const AC = window.AudioContext || window.webkitAudioContext;
	ctx = new AC();
	dest = ctx.createMediaStreamDestination();
	const ot = dest.stream.getAudioTracks()[0];
	outputTrack = ot ?? null;
	gainNode = ctx.createGain();
	gainNode.gain.value = 0;
	gainNode.connect(dest);
	analyser = ctx.createAnalyser();
	analyser.fftSize = FFT_SIZE;
	analyser.smoothingTimeConstant = SMOOTHING;
	dataArray = new Uint8Array(analyser.frequencyBinCount);
	if (!visibilityListenerAttached) {
		document.addEventListener("visibilitychange", onVisibilityChange);
		visibilityListenerAttached = true;
	}
}

function resumeCtx() {
	if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
}

/**
 * Current raw mic (getUserMedia) when gate is active.
 * @returns {MediaStreamTrack | null}
 */
export function getMicGateRawInputTrack() {
	return rawInputTrack;
}

function wireInput(track) {
	ensureGraph();
	resumeCtx();
	disconnectSource();
	const ok = track && track.readyState === "live";
	rawInputTrack = ok ? track : null;
	if (!ok || !ctx || !gainNode || !analyser) {
		currentGain = 0;
		if (gainNode) gainNode.gain.value = 0;
		stopLoop();
		return;
	}
	sourceNode = ctx.createMediaStreamSource(new MediaStream([track]));
	sourceNode.connect(analyser);
	sourceNode.connect(gainNode);
	stopLoop();
	loopOn = true;
	currentGain = 0;
	gainNode.gain.value = 0;
	rafId = requestAnimationFrame(runMeterLoop);
}

/**
 * Builds localStream for the room: first audio through gate, video unchanged.
 * @param {MediaStream | null | undefined} stream
 * @returns {MediaStream}
 */
export function prepareRoomLocalStream(stream) {
	if (!stream) return stream;
	const videos = (stream.getVideoTracks?.() ?? []).filter((t) => t && t.readyState !== "ended");
	const audios = (stream.getAudioTracks?.() ?? []).filter((t) => t && t.readyState !== "ended");

	if (!audios.length) {
		wireInput(null);
		return new MediaStream([...videos]);
	}

	const a0 = audios[0];
	ensureGraph();
	if (!outputTrack) return stream;

	if (a0 === outputTrack) {
		resumeCtx();
		stopLoop();
		loopOn = true;
		rafId = requestAnimationFrame(runMeterLoop);
		return new MediaStream([outputTrack, ...videos]);
	}

	if (rawInputTrack === a0 && sourceNode) {
		return new MediaStream([outputTrack, ...videos]);
	}

	wireInput(a0);
	return new MediaStream([outputTrack, ...videos]);
}

/**
 * End session: close graph, stop raw mic (if only used for gate).
 */
export function disposeMicNoiseGate() {
	stopLoop();
	disconnectSource();
	rawInputTrack = null;
	currentGain = 0;
	try {
		ctx?.close();
	} catch (_) {}
	ctx = null;
	analyser = null;
	gainNode = null;
	dest = null;
	outputTrack = null;
	dataArray = null;
	if (visibilityListenerAttached) {
		document.removeEventListener("visibilitychange", onVisibilityChange);
		visibilityListenerAttached = false;
	}
}
