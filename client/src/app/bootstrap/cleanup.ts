/**
 * Stop media, reset session, navigate after cleanup.
 */

import { cleanupAllSpeakingIndicators } from "../../speaking-indicator.js";
import { disposeMicNoiseGate, getMicGateRawInputTrack } from "../../effects/audio/micNoiseGate.js";
import { patchMeetingScreenSharePresentation, stopRoomMediaLatencyDisplay } from "../../effects/ui/roomView.js";
import { enqueueDeviceGraphRecovery } from "../../effects/media/devices.js";
import { refreshDeviceSelects } from "../../effects/ui/devices.js";
import { attachRemoteAudio } from "../../effects/media/tiles.js";
import { writePeerVolumes } from "../../effects/storage/deviceStorage.js";
import * as selectors from "../../domain/selectors/index.js";

/** Room view: listeners/timers for device hotplug (cleanup when leaving the room). */
let roomViewDeviceChangeTimer = null;
let roomViewVisibilityTimer = null;
/** @type {(() => void) | null} */
let roomViewVisibilityListener = null;
let roomViewFocusTimer = null;
/** @type {(() => void) | null} */
let roomViewFocusListener = null;
/** @type {(() => void | Promise<void>) | null} */
let roomViewRestartSettingsPreview = null;
/** @type {((app: HTMLElement, setupEnded: (t: MediaStreamTrack) => void) => void | Promise<void>) | null} */
let roomViewReplayMuteUnmute = null;
/** @type {((app: HTMLElement, setupEnded: (t: MediaStreamTrack) => void) => void | Promise<void>) | null} */
let roomViewRebindMicWhileMuted = null;

function clearRoomViewDeviceRecoveryUi() {
	if (roomViewDeviceChangeTimer != null) {
		clearTimeout(roomViewDeviceChangeTimer);
		roomViewDeviceChangeTimer = null;
	}
	if (roomViewVisibilityTimer != null) {
		clearTimeout(roomViewVisibilityTimer);
		roomViewVisibilityTimer = null;
	}
	if (roomViewFocusTimer != null) {
		clearTimeout(roomViewFocusTimer);
		roomViewFocusTimer = null;
	}
	if (roomViewVisibilityListener) {
		document.removeEventListener("visibilitychange", roomViewVisibilityListener);
		roomViewVisibilityListener = null;
	}
	if (roomViewFocusListener) {
		window.removeEventListener("focus", roomViewFocusListener);
		roomViewFocusListener = null;
	}
	roomViewRestartSettingsPreview = null;
	roomViewReplayMuteUnmute = null;
	roomViewRebindMicWhileMuted = null;
}

/**
 * Full recovery only makes sense when the local stream is actually broken; otherwise refresh device lists only.
 * Avoids producer/consumer storms (SFU + remote peers) on spurious `devicechange` after enumerate,
 * tab focus, or opening settings.
 */
function needsFullDeviceGraphRecoveryOnResume(getState) {
	const s = getState();
	if (selectors.selectScreen(s) !== "room-view") return false;
	const local = selectors.selectLocalStream(s);
	if (!local) return true;
	const muted = selectors.selectIsMuted(s);
	const wantVideo = Boolean(selectors.selectIsVideoEnabled(s) && (selectors.selectHasVideoSupport(s) ?? false));
	const hasLiveAudio = local.getAudioTracks?.()?.some((t) => t && t.readyState === "live") ?? false;
	const hasLiveVideo = local.getVideoTracks?.()?.some((t) => t && t.readyState === "live") ?? false;
	if (!muted && !hasLiveAudio) return true;
	if (wantVideo && !hasLiveVideo) return true;
	return false;
}

/**
 * @param {import('../../store/index.js').getState} getState
 * @param {HTMLElement} appEl
 * @param {() => void} setupEnded
 */
function runDeviceChangeOrBenignResume(getState, appEl, setupEnded) {
	/* Settings open + healthy tracks: enumerate often fires `devicechange` — skip mute-unmute chain. */
	if (selectors.selectSettingsPanelOpen(getState()) && !needsFullDeviceGraphRecoveryOnResume(getState)) {
		void refreshDeviceSelects(appEl);
		return;
	}
	if (!needsFullDeviceGraphRecoveryOnResume(getState())) {
		void refreshDeviceSelects(appEl);
		return;
	}
	enqueueDeviceGraphRecovery(
		appEl,
		attachRemoteAudio,
		setupEnded,
		() => refreshDeviceSelects(appEl),
		roomViewRestartSettingsPreview,
		roomViewReplayMuteUnmute,
		roomViewRebindMicWhileMuted
	);
}

/**
 * @param {import('../../store/index.js').dispatch} dispatch
 * @param {import('../../store/index.js').getState} getState
 */
export function setupAudioTrackEndedHandler(dispatch, getState, appEl, audioTrack) {
	if (!audioTrack || audioTrack.readyState === "ended") return;
	const wrapped = () => {
		audioTrack.removeEventListener?.("ended", wrapped);
		enqueueDeviceGraphRecovery(
			appEl,
			attachRemoteAudio,
			(t) => setupAudioTrackEndedHandler(dispatch, getState, appEl, t),
			() => refreshDeviceSelects(appEl),
			roomViewRestartSettingsPreview,
			roomViewReplayMuteUnmute,
			roomViewRebindMicWhileMuted
		);
	};
	audioTrack.addEventListener?.("ended", wrapped);
}

/**
 * @param {object} ctx
 */
export function setupRoomViewDeviceHandlers(ctx) {
	const {
		appEl,
		dispatch,
		getState,
		restartSettingsPreview,
		replayMuteUnmuteForDeviceRecovery,
		rebindMicWhileMutedForDeviceRecovery
	} = ctx;
	clearRoomViewDeviceRecoveryUi();
	roomViewRestartSettingsPreview = restartSettingsPreview ?? null;
	roomViewReplayMuteUnmute = replayMuteUnmuteForDeviceRecovery ?? null;
	roomViewRebindMicWhileMuted = rebindMicWhileMutedForDeviceRecovery ?? null;
	const s = getState();
	const rawMic = getMicGateRawInputTrack();
	const fallback = selectors.selectLocalStream(s)?.getAudioTracks?.()?.[0];
	const audioTrack = rawMic && rawMic.readyState !== "ended" ? rawMic : fallback;
	if (audioTrack && audioTrack.readyState !== "ended") {
		setupAudioTrackEndedHandler(dispatch, getState, appEl, audioTrack);
	}
	const prevHandler = selectors.selectCallDeviceChangeHandler(getState());
	navigator.mediaDevices?.removeEventListener?.("devicechange", prevHandler);
	const setupEnded = (t) => setupAudioTrackEndedHandler(dispatch, getState, appEl, t);
	const flushRecovery = () => {
		roomViewDeviceChangeTimer = null;
		runDeviceChangeOrBenignResume(getState, appEl, setupEnded);
	};
	const newHandler = () => {
		if (roomViewDeviceChangeTimer != null) clearTimeout(roomViewDeviceChangeTimer);
		roomViewDeviceChangeTimer = setTimeout(flushRecovery, 280);
	};
	dispatch({ type: "effects/callDeviceChangeHandler", payload: { handler: newHandler } });
	navigator.mediaDevices?.addEventListener?.("devicechange", newHandler);

	/* Tab visible again: never full media recovery — dropdowns only. Full chain only on track-ended / devicechange + broken stream. */
	roomViewVisibilityListener = () => {
		if (document.visibilityState !== "visible") return;
		if (roomViewVisibilityTimer != null) clearTimeout(roomViewVisibilityTimer);
		roomViewVisibilityTimer = setTimeout(() => {
			roomViewVisibilityTimer = null;
			if (selectors.selectScreen(getState()) !== "room-view") return;
			void refreshDeviceSelects(appEl);
		}, 220);
	};
	document.addEventListener("visibilitychange", roomViewVisibilityListener);

	/* Window focus: device lists only as well (no mute-unmute / no producer rebuilds). */
	roomViewFocusListener = () => {
		if (roomViewFocusTimer != null) clearTimeout(roomViewFocusTimer);
		roomViewFocusTimer = setTimeout(() => {
			roomViewFocusTimer = null;
			if (selectors.selectScreen(getState()) !== "room-view") return;
			void refreshDeviceSelects(appEl);
		}, 350);
	};
	window.addEventListener("focus", roomViewFocusListener);
}

/**
 * @param {object} ctx
 */
export function handleStopScreen(ctx) {
	const { appEl, dispatch, getState } = ctx;
	const s = getState();
	const myPeerId = selectors.selectMyPeerId(s);
	selectors
		.selectHostStream(s)
		?.getTracks()
		.forEach((t) => t.stop());
	const viewerScreenCall = s.viewerScreenCall;
	if (viewerScreenCall) viewerScreenCall.close?.();
	dispatch({ type: "media/screenSharingStopped" });
	const s2 = getState();
	selectors.selectHostPeer(s2)?.clearScreenStream?.();
	selectors.selectHostPeer(s2)?.broadcastScreenSharingStopped?.(myPeerId);
	patchMeetingScreenSharePresentation(appEl);
}

/**
 * @param {import('../../store/index.js').dispatch} dispatch
 * @param {import('../../store/index.js').getState} getState
 */
export function closeActiveMediasoupParticipant(dispatch, getState) {
	const s = getState();
	const participant = selectors.selectHostPeer(s) || selectors.selectViewerConn(s);
	if (!participant) return;
	try {
		participant.close?.();
	} catch (e) {
		console.warn("[easymeet] close participant:", e?.message || e);
	}
	dispatch({ type: "peer/connectionEstablished", payload: { hostPeer: null, viewerConn: null } });
}

/**
 * @param {object} ctx
 * @param {string} screen
 */
export function cleanupAndNavigate(ctx, appEl, screen) {
	closeActiveMediasoupParticipant(ctx.dispatch, ctx.getState);
	finishCleanup(ctx, appEl, screen);
}

/**
 * @param {import('../../store/index.js').getState} getState
 */
function stopAllStreamsAndConnections(getState) {
	disposeMicNoiseGate();
	const s = getState();
	selectors
		.selectLocalStream(s)
		?.getTracks?.()
		.forEach((t) => t.stop());
	selectors
		.selectHostStream(s)
		?.getTracks?.()
		.forEach((t) => t.stop());
	s.viewerScreenCall?.close?.();
	try {
		s.backgroundEffectStop?.();
	} catch (_) {}
	selectors.selectPeer(s)?.destroy();
}

/**
 * @param {import('../../store/index.js').dispatch} dispatch
 */
function removeDeviceChangeHandlers(dispatch, s) {
	const deviceHandler = s._deviceChangeHandler;
	const callDeviceHandler = s._callDeviceChangeHandler;
	if (deviceHandler) {
		navigator.mediaDevices?.removeEventListener?.("devicechange", deviceHandler);
		dispatch({ type: "effects/deviceChangeHandler", payload: { handler: null } });
	}
	if (callDeviceHandler) {
		navigator.mediaDevices?.removeEventListener?.("devicechange", callDeviceHandler);
		dispatch({ type: "effects/callDeviceChangeHandler", payload: { handler: null } });
	}
	clearRoomViewDeviceRecoveryUi();
}

/**
 * @param {object} ctx
 * @param {string} screen
 */
export function finishCleanup(ctx, appEl, screen) {
	const { dispatch, getState, navigate } = ctx;
	stopRoomMediaLatencyDisplay(appEl);
	const s = getState();
	stopAllStreamsAndConnections(getState);
	dispatch({ type: "session/cleared" });
	const audioContainer = document.getElementById("remote-audio-container");
	if (audioContainer) audioContainer.innerHTML = "";
	removeDeviceChangeHandlers(dispatch, s);
	cleanupAllSpeakingIndicators();
	navigate(appEl, screen);
}

/**
 * @param {import('../../store/index.js').dispatch} dispatch
 * @param {import('../../store/index.js').getState} getState
 * @param {() => Record<string, number>} readPeerVolumes
 */
export function loadPeerVolumes(dispatch, getState, readPeerVolumes) {
	const volumes = readPeerVolumes();
	dispatch({ type: "peer/volumesMerged", payload: { volumes } });
}

/**
 * @param {import('../../store/index.js').getState} getState
 */
export function savePeerVolumes(getState) {
	writePeerVolumes(Object.fromEntries(selectors.selectPeerVolume(getState())));
}

/**
 * @param {import('../../store/index.js').dispatch} dispatch
 * @param {import('../../store/index.js').getState} getState
 */
export function setPeerVolume(dispatch, getState, peerId, percent) {
	const vol = Math.max(0, Math.min(200, percent)) / 100;
	dispatch({ type: "peer/volumeChanged", payload: { peerId, percent } });
	savePeerVolumes(getState);
	const container = document.getElementById("video-gallery") || document.getElementById("remote-audio-container");
	const tile = container?.querySelector(`.video-tile[data-peer-id="${peerId}"]`);
	const v = Math.min(1, vol);
	tile?.querySelectorAll("video, audio").forEach((el) => {
		el.volume = v;
	});
}

/**
 * @param {object} ctx
 */
export function setupBeforeUnload(ctx) {
	const { getState } = ctx;
	window.addEventListener("beforeunload", () => {
		const s = getState();
		const participant = selectors.selectHostPeer(s) || selectors.selectViewerConn(s);
		try {
			participant?.close?.();
		} catch (_) {}
		try {
			s.backgroundEffectStop?.();
		} catch (_) {}
		disposeMicNoiseGate();
		selectors
			.selectLocalStream(s)
			?.getTracks?.()
			.forEach((t) => t.stop());
		selectors.selectPeer(s)?.destroy?.();
	});
}

export { refreshDeviceSelects, attachRemoteAudio };
