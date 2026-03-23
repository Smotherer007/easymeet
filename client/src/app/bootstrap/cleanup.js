/**
 * Medien stoppen, Session zurücksetzen, Navigation nach Cleanup.
 */

import { cleanupAllSpeakingIndicators } from "../../speaking-indicator.js";
import { disposeMicNoiseGate } from "../../effects/audio/micNoiseGate.js";
import { patchMeetingScreenSharePresentation, stopRoomMediaLatencyDisplay } from "../../effects/ui/roomView.js";
import { reacquireAudioStreamIfNeeded } from "../../effects/media/devices.js";
import { refreshDeviceSelects } from "../../effects/ui/devices.js";
import { attachRemoteAudio } from "../../effects/media/tiles.js";
import { writePeerVolumes } from "../../effects/storage/deviceStorage.js";
import * as selectors from "../../domain/selectors/index.js";

/**
 * @param {import('../../store/index.js').dispatch} dispatch
 * @param {import('../../store/index.js').getState} getState
 */
export function setupAudioTrackEndedHandler(dispatch, getState, appEl, audioTrack) {
	if (!audioTrack || audioTrack.readyState === "ended") return;
	const wrapped = () => {
		audioTrack.removeEventListener?.("ended", wrapped);
		reacquireAudioStreamIfNeeded(appEl, attachRemoteAudio, (t) => setupAudioTrackEndedHandler(dispatch, getState, appEl, t));
	};
	audioTrack.addEventListener?.("ended", wrapped);
}

/**
 * @param {object} ctx
 */
export function setupRoomViewDeviceHandlers(ctx) {
	const { appEl, dispatch, getState } = ctx;
	const s = getState();
	const audioTrack = selectors.selectLocalStream(s)?.getAudioTracks?.()[0];
	if (audioTrack && audioTrack.readyState !== "ended") {
		setupAudioTrackEndedHandler(dispatch, getState, appEl, audioTrack);
	}
	const prevHandler = selectors.selectCallDeviceChangeHandler(getState());
	navigator.mediaDevices?.removeEventListener?.("devicechange", prevHandler);
	const newHandler = () => reacquireAudioStreamIfNeeded(appEl, attachRemoteAudio, (t) => setupAudioTrackEndedHandler(dispatch, getState, appEl, t));
	dispatch({ type: "effects/callDeviceChangeHandler", payload: { handler: newHandler } });
	navigator.mediaDevices?.addEventListener?.("devicechange", newHandler);
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
