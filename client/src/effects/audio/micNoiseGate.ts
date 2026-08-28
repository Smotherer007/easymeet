/**
 * Speech gate on the outgoing microphone (Web Audio).
 * Raw mic stays only in this pipeline; localStream carries the output track for WebRTC + UI.
 *
 * Level detection is RMS in dBFS (see levelMeter.js) so virtual / loopback input devices behave
 * like hardware mics.
 *
 * Two modes:
 * - **gated**: raw mic → analyser + gain → MediaStreamDestination; the destination track is sent.
 * - **bypass** (gate switched off in the settings): the raw track is sent unchanged. The analyser
 *   stays attached for the level meter, but no gain stage and no destination — no resampling, no
 *   added latency, and the outgoing track is a real device track again (so `applyConstraints`
 *   for echo cancellation / noise suppression reaches it).
 */

import { getSpeakingThreshold, isMicGateEnabled, isMicSelfMonitorEnabled } from "../storage/audioSettingsStorage.js";
import { getSharedAudioContext, resumeSharedAudioContext } from "./audioContext.js";
import { createDbfsReader, createMeterAnalyser, speakingThresholdToDbfs, SILENCE_DBFS } from "./levelMeter.js";

const ATTACK = 0.28;
const RELEASE = 0.12;
/** Close only this far below the open threshold — avoids chattering on steady speech. */
const HYSTERESIS_DB = 6;
/** Keep the gate open this long after the last active frame — avoids clipped word endings. */
const HOLD_MS = 220;

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
/** @type {(() => number) | null} */
let readDbfs = null;
let currentGain = 0;
let gateOpen = false;
let lastActiveTs = 0;
let lastDbfs = SILENCE_DBFS;
/** Loudest level since the last readMicPeakDbfs() — used by the outgoing-audio watchdog. */
let peakDbfs = SILENCE_DBFS;
/** Gain path built (gated mode) vs. meter only (bypass). */
let gated = false;
/** Settings UI wants a live level — keeps the loop running in bypass mode. */
let meterActive = false;
let visibilityListenerAttached = false;
/** Self-monitor path (hear the mic through speakers/headphones) — taps the raw input. */
let monitorGain = null;
let monitorOn = false;
let monitorSourceConnected = false;

function ensureCtx() {
	if (!ctx) ctx = getSharedAudioContext();
	return ctx;
}

/** Build the monitor tap: raw mic → monitorGain → speakers (ctx.destination). */
function ensureMonitorGain() {
	if (!ensureCtx()) return false;
	if (!monitorGain) {
		monitorGain = ctx.createGain();
		monitorGain.gain.value = 0.6;
		monitorGain.connect(ctx.destination);
	}
	return true;
}

/** (Re)wire or unwire the source-node → monitorGain connection. */
function updateMonitorConnection() {
	const want = monitorOn && sourceNode && monitorGain;
	if (want && !monitorSourceConnected) {
		try {
			sourceNode.connect(monitorGain);
			monitorSourceConnected = true;
		} catch (_) {}
	} else if (!want && monitorSourceConnected) {
		try {
			sourceNode?.disconnect(monitorGain);
		} catch (_) {}
		monitorSourceConnected = false;
	}
}

/**
 * Self-monitoring: hear your own microphone through the chosen speakers/headphones.
 * Works for every mic (virtual loopback and hardware alike); gate-independent.
 * @param {boolean} on
 */
export function setMicSelfMonitor(on) {
	monitorOn = !!on;
	if (!monitorOn) {
		updateMonitorConnection();
		return;
	}
	if (!ensureMonitorGain() || !sourceNode) return;
	resumeSharedAudioContext();
	updateMonitorConnection();
}

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

function ensureLoop() {
	if (loopOn || !analyser || !readDbfs) return;
	loopOn = true;
	rafId = requestAnimationFrame(runMeterLoop);
}

function passThrough() {
	currentGain = 1;
	gateOpen = true;
	lastActiveTs = performance.now();
	if (gainNode) gainNode.gain.value = 1;
}

function onVisibilityChange() {
	if (document.hidden) {
		/* Background tabs can throttle/pause RAF. Keep mic transmission alive by
		 * forcing pass-through while hidden instead of freezing at gain=0. */
		if (gated) passThrough();
		return;
	}
	resumeSharedAudioContext();
	if (gated || meterActive) ensureLoop();
}

/**
 * Level meter for the settings UI. Off by default so bypass mode costs nothing while the
 * settings panel is closed.
 * @param {boolean} on
 */
export function setMicMeterActive(on) {
	meterActive = !!on;
	if (!meterActive) return;
	resumeSharedAudioContext();
	ensureLoop();
}

/**
 * Current input level and gate state for the settings UI.
 * @returns {{ dbfs: number; gateOpen: boolean; gated: boolean; hasInput: boolean }}
 */
export function getMicMeterState() {
	return {
		dbfs: lastDbfs,
		gateOpen: gated ? gateOpen : true,
		gated,
		hasInput: Boolean(rawInputTrack && rawInputTrack.readyState === "live")
	};
}

/**
 * Loudest input level since the last call, then resets. The watchdog uses it to tell
 * "nobody is speaking" apart from "signal arrives but nothing leaves".
 * @returns {number} dBFS
 */
export function readMicPeakDbfs() {
	const v = peakDbfs;
	peakDbfs = SILENCE_DBFS;
	return v;
}

/**
 * Re-read the gate settings immediately (settings UI). With the gate switched off the mic must
 * pass through even when the meter loop is throttled (hidden tab) or not running yet.
 */
export function refreshMicGateSettings() {
	if (!isMicGateEnabled()) {
		if (gated) passThrough();
		return;
	}
	resumeSharedAudioContext();
	if (gated) ensureLoop();
}

function runMeterLoop() {
	if (!loopOn) return;
	if (!analyser || !readDbfs) {
		stopLoop();
		return;
	}

	lastDbfs = rawInputTrack && rawInputTrack.readyState === "live" ? readDbfs() : SILENCE_DBFS;
	if (lastDbfs > peakDbfs) peakDbfs = lastDbfs;

	if (gated && gainNode) {
		if (!isMicGateEnabled()) {
			/* Safety net: setting changed but the stream was not rebuilt — never swallow audio. */
			passThrough();
		} else {
			const openDb = speakingThresholdToDbfs(getSpeakingThreshold());
			const closeDb = openDb - HYSTERESIS_DB;
			const now = performance.now();
			const active = lastDbfs >= (gateOpen ? closeDb : openDb);
			if (active) {
				gateOpen = true;
				lastActiveTs = now;
			} else if (now - lastActiveTs >= HOLD_MS) {
				gateOpen = false;
			}
			const target = gateOpen ? 1 : 0;
			const k = target > currentGain ? ATTACK : RELEASE;
			currentGain += (target - currentGain) * k;
			if (currentGain < 0.002) currentGain = 0;
			if (currentGain > 0.998) currentGain = 1;
			gainNode.gain.value = currentGain;
		}
	}

	if (!gated && !meterActive) {
		stopLoop();
		return;
	}
	rafId = requestAnimationFrame(runMeterLoop);
}

/** Analyser only — needed in both modes. */
function ensureMeter() {
	if (!ensureCtx()) return false;
	if (!analyser) {
		analyser = createMeterAnalyser(ctx);
		readDbfs = createDbfsReader(analyser);
	}
	if (!visibilityListenerAttached) {
		document.addEventListener("visibilitychange", onVisibilityChange);
		visibilityListenerAttached = true;
	}
	return true;
}

/** Gain stage + destination track (gated mode). */
function ensureGatePath() {
	if (!ensureMeter()) return false;
	if (!dest) {
		dest = ctx.createMediaStreamDestination();
		outputTrack = dest.stream.getAudioTracks()[0] ?? null;
	}
	if (!gainNode) {
		gainNode = ctx.createGain();
		gainNode.gain.value = 0;
		gainNode.connect(dest);
	}
	return Boolean(outputTrack);
}

/**
 * Drop the gain stage (bypass). The destination track is not stopped — the mic producer may still
 * hold it until `updateLocalStream` has swapped in the raw track.
 */
function teardownGatePath() {
	try {
		gainNode?.disconnect();
	} catch (_) {}
	gainNode = null;
	dest = null;
	outputTrack = null;
	currentGain = 0;
	gateOpen = false;
}

/**
 * Stop the mic track we are about to drop — otherwise every device switch leaks the previous
 * getUserMedia capture instance (the browser keeps the old device claimed until the tab closes).
 * @param {MediaStreamTrack | null} nextTrack Track that will replace the current raw input (if any).
 */
function stopReplacedRawTrack(nextTrack) {
	if (rawInputTrack && rawInputTrack !== nextTrack && rawInputTrack.readyState === "live") {
		try {
			rawInputTrack.stop();
		} catch (_) {}
	}
}

/**
 * @param {MediaStreamTrack | null} track raw microphone track
 * @param {boolean} wantGate
 */
function wireInput(track, wantGate) {
	const ok = track && track.readyState === "live";
	if (!ok) {
		disconnectSource();
		stopReplacedRawTrack(null);
		rawInputTrack = null;
		lastDbfs = SILENCE_DBFS;
		if (wantGate && gainNode) {
			currentGain = 0;
			gateOpen = false;
			gainNode.gain.value = 0;
		}
		stopLoop();
		return;
	}
	if (!ensureMeter()) return;
	resumeSharedAudioContext();

	if (wantGate) {
		if (!ensureGatePath()) return;
	} else if (gainNode) {
		teardownGatePath();
	}
	gated = wantGate;

	disconnectSource();
	stopReplacedRawTrack(track);
	rawInputTrack = track;
	sourceNode = ctx.createMediaStreamSource(new MediaStream([track]));
	sourceNode.connect(analyser);
	if (gated && gainNode) sourceNode.connect(gainNode);
	/* Self-monitor state survives reloads — derive it from the stored setting. */
	monitorOn = isMicSelfMonitorEnabled();
	monitorSourceConnected = false;
	updateMonitorConnection();

	stopLoop();
	if (gated) {
		if (document.hidden) {
			passThrough();
		} else {
			/* Start closed; the first frames above the threshold open it. */
			currentGain = 0;
			gateOpen = false;
			lastActiveTs = 0;
			gainNode.gain.value = 0;
		}
	}
	if (gated || meterActive) ensureLoop();
}

/**
 * Current raw mic (getUserMedia) — in gated mode this is *not* the track being sent.
 * @returns {MediaStreamTrack | null}
 */
export function getMicGateRawInputTrack() {
	return rawInputTrack;
}

/**
 * Builds localStream for the room: audio through the gate (or raw when the gate is off),
 * video unchanged.
 * @param {MediaStream | null | undefined} stream
 * @returns {MediaStream}
 */
export function prepareRoomLocalStream(stream) {
	if (!stream) return stream;
	const videos = (stream.getVideoTracks?.() ?? []).filter((t) => t && t.readyState !== "ended");
	const audios = (stream.getAudioTracks?.() ?? []).filter((t) => t && t.readyState !== "ended");

	if (!audios.length) {
		wireInput(null, isMicGateEnabled());
		return new MediaStream([...videos]);
	}

	const a0 = audios[0];
	/* Called again with an already prepared stream: recover the raw track behind the gate output. */
	const raw = outputTrack && a0 === outputTrack ? rawInputTrack : a0;
	const wantGate = isMicGateEnabled();

	if (!raw || raw.readyState === "ended") {
		wireInput(null, wantGate);
		return new MediaStream([...videos]);
	}

	if (raw !== rawInputTrack || gated !== wantGate || (wantGate && !outputTrack)) {
		wireInput(raw, wantGate);
	} else if (gated || meterActive) {
		resumeSharedAudioContext();
		ensureLoop();
	}

	if (gated && outputTrack) return new MediaStream([outputTrack, ...videos]);
	return new MediaStream([raw, ...videos]);
}

/**
 * End session / mute: tear down the graph and stop the raw mic.
 *
 * The shared AudioContext stays alive (notification tones use it) but the microphone track is
 * released here — in gated mode it is not part of `localStream`, so nobody else stops it and the
 * device would stay claimed after leaving the room.
 * @param {{ keepRawMic?: boolean }} [options]
 */
export function disposeMicNoiseGate(options = {}) {
	stopLoop();
	disconnectSource();
	if (!options.keepRawMic && rawInputTrack && rawInputTrack.readyState === "live") {
		try {
			rawInputTrack.stop();
		} catch (_) {}
	}
	rawInputTrack = null;
	teardownGatePath();
	try {
		analyser?.disconnect();
	} catch (_) {}
	analyser = null;
	readDbfs = null;
	monitorOn = false;
	monitorSourceConnected = false;
	try {
		monitorGain?.disconnect();
	} catch (_) {}
	monitorGain = null;
	ctx = null;
	gated = false;
	meterActive = false;
	lastDbfs = SILENCE_DBFS;
	peakDbfs = SILENCE_DBFS;
	lastActiveTs = 0;
	if (visibilityListenerAttached) {
		document.removeEventListener("visibilitychange", onVisibilityChange);
		visibilityListenerAttached = false;
	}
}
