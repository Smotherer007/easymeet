/**
 * Diagnostics for camera / background effects / mediasoup.
 *
 * Enable (one is enough, then reload):
 * - URL: append `?easymeetMediaDebug=1`
 * - Console: `localStorage.setItem('easymeetMediaDebug', '1')`
 * - Vite dev (`npm run dev`): debug is **on automatically**
 *
 * Logs: **`[easymeet/media-debug]`** as **warn** (visible even when "Info" is filtered).
 * Disable: `localStorage.removeItem('easymeetMediaDebug')` and load without the URL param.
 *
 * ---
 * **B) Device hotplug / mic — research checklist (console filter)**
 *
 * 1. Turn on debug (see above), reload, reproduce the issue.
 * 2. Filter console for **`device:recovery`** (recovery chain) and optionally **`ms:`** (mediasoup).
 * 3. Table — meaning of phases:
 *
 * | Phase / prefix | Meaning |
 * |----------------|---------|
 * | `device:recovery:chain:run` | Queue started after **track `ended`**, or after `devicechange` **only if** the local stream truly has no live audio/video track (not on tab focus/visibility; with settings open often suppressed when the stream is still healthy). |
 * | `device:recovery:skip` | `payload.reason`: e.g. `not-room-view`, `no-local-stream` |
 * | `device:recovery:reacquire:start` | Reacquire logic runs; `muted` / `wantVideo` in payload |
 * | `device:recovery:abort` | `reason`: missing callbacks (`no-replay-mute-unmute`, `no-rebind-mic-while-muted`) |
 * | `device:recovery:use-muted-rebind` | User became muted before replay → muted rebind path |
 * | `device:recovery:mute-unmute-cycle:*` | Replay like mute/unmute (unmuted only) |
 * | `device:recovery:rebind-mic-while-muted:*` | Rebind mic while user is muted |
 * | `device:recovery:camera-reacquire-skipped` | Webcam not reacquired in muted branch |
 * | `device:recovery:post-chain:mic-producer-force` | Final mediasoup `updateLocalStream` with `forceMicProducer` |
 * | `device:recovery:reacquire:done` | `branch` in payload: which path finished |
 * | `device:recovery:error` | Exception in reacquire block |
 * | `ms:do-update-local-stream:start` | Mediasoup processing stream update |
 * | `ms:mic-producer:recreate` | Mic producer recreated |
 * | `ms:update-local-stream:queued` | Update waiting on lock (parallel path) |
 *
 * 4. **Interpretation:** If `chain:run` is missing despite real hotplug (track really gone) → check `devicechange` / track `ended`. Tab/focus no longer trigger **`chain:run`**. If `chain:run` is present but audio still broken → `chrome://webrtc-internals` / mediasoup logs.
 *
 * Once per browser tab, a short summary is printed on first `device:recovery:chain:run`. Manual: **`window.printEasymeetDeviceRecoveryGuide()`** (only when debug is on).
 */

function urlDebugOn() {
	try {
		return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("easymeetMediaDebug") === "1";
	} catch {
		return false;
	}
}

const SESSION_GUIDE_KEY = "easymeet_media_debug_recovery_guide_v1";

/**
 * Prints short checklist B) to the console (useful after reload or manually).
 * Only meaningful with media debug enabled (`easymeetMediaDebug`).
 */
export function printEasymeetDeviceRecoveryGuide() {
	if (!mediaDebugEnabled()) {
		console.warn(
			"[easymeet/media-debug] Media debug is off. Enable: ?easymeetMediaDebug=1 or localStorage.setItem('easymeetMediaDebug','1'), then reload."
		);
	}
	const lines = [
		"[easymeet/media-debug] — Checklist B) device recovery (short)",
		"Filter: \"device:recovery\" | optional \"ms:\" for mediasoup",
		"· chain:run        → recovery started (often missing = no browser event / focus)",
		"· reacquire:start/done/error → core path",
		"· mute-unmute-cycle / rebind-mic-while-muted → which audio branch",
		"· post-chain:mic-producer-force → final mediasoup push",
		"· ms:mic-producer:recreate → producer truly recreated",
		"Full table: file header comment in client/src/utils/mediaDebug.js"
	];
	console.warn(lines.join("\n"));
}

function maybePrintRecoveryGuideOnce(phase) {
	if (phase !== "device:recovery:chain:run") return;
	try {
		if (typeof sessionStorage === "undefined") return;
		if (sessionStorage.getItem(SESSION_GUIDE_KEY) === "1") return;
		sessionStorage.setItem(SESSION_GUIDE_KEY, "1");
	} catch {
		return;
	}
	printEasymeetDeviceRecoveryGuide();
}

export function mediaDebugEnabled() {
	try {
		if (typeof localStorage !== "undefined" && localStorage.getItem("easymeetMediaDebug") === "0") return false;
	} catch {
		/* ignore */
	}
	try {
		if (typeof import.meta !== "undefined" && import.meta.env?.DEV) return true;
	} catch {
		/* ignore */
	}
	if (urlDebugOn()) return true;
	try {
		return typeof localStorage !== "undefined" && localStorage.getItem("easymeetMediaDebug") === "1";
	} catch {
		return false;
	}
}

/**
 * @param {string} phase Short label (e.g. effect:apply:start)
 * @param {Record<string, unknown>} [data]
 */
export function mediaDebugLog(phase, data) {
	if (!mediaDebugEnabled()) return;
	maybePrintRecoveryGuideOnce(phase);
	const payload = data !== undefined ? data : {};
	console.warn("[easymeet/media-debug]", phase, payload);
}

/* Console: printEasymeetDeviceRecoveryGuide() — only useful with media debug on */
try {
	if (typeof globalThis !== "undefined") {
		globalThis.printEasymeetDeviceRecoveryGuide = printEasymeetDeviceRecoveryGuide;
	}
} catch {
	/* ignore */
}

/** Short summary of a MediaStreamTrack (no large objects). */
export function mediaDebugTrackInfo(t) {
	if (!t) return null;
	return {
		id: t.id,
		kind: t.kind,
		readyState: t.readyState,
		enabled: t.enabled,
		muted: t.muted,
		label: t.label?.slice?.(0, 80),
		deviceId: t.getSettings?.()?.deviceId?.slice?.(0, 12)
	};
}

const _wiredVideoDebug = new WeakSet();

/** Once: wire `ended` / `mute` on local video tracks to explain black picture without effect logs. */
export function mediaDebugWireStreamVideoTracks(stream, label) {
	if (!mediaDebugEnabled() || !stream?.getVideoTracks) return;
	for (const t of stream.getVideoTracks()) {
		if (!t || _wiredVideoDebug.has(t)) continue;
		_wiredVideoDebug.add(t);
		t.addEventListener("ended", () => {
			console.warn("[easymeet/media-debug]", "video-track:ended", {
				label,
				track: mediaDebugTrackInfo(t)
			});
		});
		t.addEventListener("mute", () => {
			console.warn("[easymeet/media-debug]", "video-track:mute", {
				label,
				track: mediaDebugTrackInfo(t)
			});
		});
	}
}

/** Compact list of video/audio tracks of a stream. */
export function mediaDebugStreamInfo(stream) {
	if (!stream) return { video: [], audio: [] };
	return {
		video: (stream.getVideoTracks?.() ?? []).map(mediaDebugTrackInfo),
		audio: (stream.getAudioTracks?.() ?? []).map(mediaDebugTrackInfo)
	};
}
