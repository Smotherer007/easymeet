/**
 * Effect: Media / Background effects.
 * Isolates local stream manipulations from domain logic.
 */

import { getState, patchState } from "../../store/index.js";
import {
	selectLocalStream,
	selectBaseLocalStream,
	selectCameraVideoTrackForEffects,
	selectIsMuted,
	selectIsVideoEnabled,
	selectScreen,
	selectVoipMembers,
	selectMyPeerId,
	selectScreenStreams,
	selectPeerMuteState,
	selectPeerVolume,
	selectBackgroundEffect,
	selectPeerVideoState,
	selectPeerBackgroundEffect,
	selectHostPeer,
	selectViewerConn,
	selectInputDeviceId,
	selectVideoDeviceId,
	selectHasVideoSupport,
	selectFirstLiveDeviceVideoTrackFromStreams
} from "../../domain/selectors/index.js";
import { createBlurredStream, createVirtualBackgroundStream, isSupported as isBackgroundEffectsSupported, BACKGROUND_IMAGES } from "../../effects/backgroundEffects.js";
import { getCustomBackgrounds } from "../storage/customBackgroundStorage.js";
import { readDeviceIds, writeDeviceId } from "../storage/deviceStorage.js";
import { DEVICE_STORAGE } from "../../shared/constants.js";
import * as peer from "../network/mediasoupClient.js";
import { prepareRoomLocalStream } from "../audio/micNoiseGate.js";
import { startSpeakingIndicator, stopSpeakingIndicator } from "../../speaking-indicator.js";
import { mediaDebugLog, mediaDebugStreamInfo, mediaDebugTrackInfo } from "../../utils/mediaDebug.js";

/** Serialized execution: fast repeated toggles must not run in parallel (insertable-streams pipe breaks). */
let _applyEffectTail = Promise.resolve();

/**
 * Apply background effects and update the local stream.
 * (I/O & side effects — layer 4)
 * @param {string} effect
 * @param {HTMLElement} app
 * @param {Function} attachRemoteAudio
 * @param {Function} updateVoipParticipants
 * @param {Function} updateEffectTilesSelection
 * @param {Function} getStreamForPeerId
 * @param {Function} getStreamForScreenShare
 * @param {Function} navigate
 */
export function applyEffectToCallStream(effect, app, attachRemoteAudio, updateVoipParticipants, updateEffectTilesSelection, getStreamForPeerId, getStreamForScreenShare, navigate) {
	const p = _applyEffectTail.then(() =>
		applyEffectToCallStreamInternal(effect, app, attachRemoteAudio, updateVoipParticipants, updateEffectTilesSelection, getStreamForPeerId, getStreamForScreenShare, navigate)
	);
	_applyEffectTail = p.catch((err) => {
		console.error("[easymeet] applyEffectToCallStream failed:", err);
		mediaDebugLog("effect:call:promise-reject", {
			message: err?.message,
			name: err?.name,
			stack: typeof err?.stack === "string" ? err.stack.split("\n").slice(0, 8).join("\n") : undefined
		});
	});
	return p;
}

/** Prefer real camera track (deviceId), else any live video track (some browsers omit deviceId). */
function firstLiveCameraLikeVideoTrack(stream) {
	const live = [...(stream?.getVideoTracks?.() ?? [])].filter((t) => t && t.readyState === "live");
	const withDevice = live.find((t) => t.getSettings?.()?.deviceId);
	return withDevice || live[0] || null;
}

/**
 * No live camera in state but UI wants video → re-acquire camera (e.g. raw track ended after effect stop in Chromium).
 */
/**
 * After a broken effect switch: re-wire camera and refresh local tile.
 * (Export for `handleBackgroundEffectChange` when no video track remains in state.)
 */
export async function recoverCameraAfterEffectLoss(app, attachRemoteAudioFn) {
	await ensureCameraTrackWhenVideoEnabled();
	const peerId = selectMyPeerId(getState());
	const stream = selectLocalStream(getState());
	if (peerId && stream && typeof attachRemoteAudioFn === "function") {
		attachRemoteAudioFn(peerId, stream, app);
	}
}

async function ensureCameraTrackWhenVideoEnabled() {
	const st = getState();
	if (!selectIsVideoEnabled(st)) return;
	const live = selectFirstLiveDeviceVideoTrackFromStreams(selectBaseLocalStream(st), selectLocalStream(st));
	if (live && live.readyState === "live") return;

	try {
		const inputId = selectInputDeviceId(st) || undefined;
		const videoId = selectVideoDeviceId(st) || undefined;
		const stream = await peer.getUserMediaResilient(inputId, "videoOnly", videoId);
		const vt = stream.getVideoTracks?.()?.[0];
		stream.getAudioTracks?.().forEach((t) => t.stop());
		if (!vt || vt.readyState === "ended") return;

		const audios = [...(selectLocalStream(st)?.getAudioTracks?.() ?? [])].filter((t) => t && t.readyState !== "ended");
		const repaired = new MediaStream([...audios, vt]);
		const forRoom = prepareRoomLocalStream(repaired);
		vt.enabled = selectIsVideoEnabled(st) ?? true;
		const vDev = vt.getSettings?.()?.deviceId || videoId || null;
		patchState({
			baseLocalStream: new MediaStream([vt]),
			localStream: forRoom,
			...(vDev ? { videoDeviceId: vDev } : {})
		});
		if (vDev) writeDeviceId(DEVICE_STORAGE.video, vDev);

		const participant = selectHostPeer(getState()) || selectViewerConn(getState());
		try {
			await participant?.updateLocalStream?.(forRoom);
		} catch (e) {
			console.warn("[easymeet] updateLocalStream after camera re-acquire:", e?.message || e);
		}
		mediaDebugLog("effect:camera-reacquired", { track: mediaDebugTrackInfo(vt) });
	} catch (e) {
		console.warn("[easymeet] camera re-acquire (effect) failed:", e?.message || e);
		mediaDebugLog("effect:camera-reacquire-failed", { error: e?.message || String(e) });
	}
}

/** Effect off: audio from local + raw from base (contract while effect on), else live video (camera before generator). */
function buildMergedStreamAfterEffectOff() {
	const st = getState();
	const local = selectLocalStream(st);
	const base = selectBaseLocalStream(st);
	const audios = [...(local?.getAudioTracks?.() ?? [])].filter((t) => t && t.readyState !== "ended");
	let raw = firstLiveCameraLikeVideoTrack(base);
	if (!raw) raw = firstLiveCameraLikeVideoTrack(local);
	const tracks = [...audios];
	if (raw && raw.readyState !== "ended") tracks.push(raw);
	if (!tracks.length) return local ?? null;
	return new MediaStream(tracks);
}

async function applyEffectToCallStreamInternal(
	effect,
	app,
	attachRemoteAudio,
	updateVoipParticipants,
	updateEffectTilesSelection,
	getStreamForPeerId,
	getStreamForScreenShare,
	navigate
) {
	const turningEffectOff = !effect || effect === "none";

	let s = getState();
	let camTrack = selectCameraVideoTrackForEffects(s);
	mediaDebugLog("effect:call:start", {
		effect,
		turningEffectOff,
		hadStop: Boolean(s.backgroundEffectStop),
		camForPipeline: mediaDebugTrackInfo(camTrack),
		local: mediaDebugStreamInfo(selectLocalStream(s)),
		base: mediaDebugStreamInfo(selectBaseLocalStream(s)),
		videoEnabled: selectIsVideoEnabled(s)
	});
	/* "No background" must still run when generator track is ended after stop() — else no merge, broken stream. */
	if (!turningEffectOff && (!camTrack || camTrack.readyState === "ended")) {
		if (selectIsVideoEnabled(s)) {
			await ensureCameraTrackWhenVideoEnabled();
			s = getState();
			camTrack = selectCameraVideoTrackForEffects(s);
		}
		if (!turningEffectOff && (!camTrack || camTrack.readyState === "ended")) {
			mediaDebugLog("effect:call:abort", { reason: "no-cam-for-pipeline", cam: mediaDebugTrackInfo(camTrack) });
			return;
		}
	}

	if (s.backgroundEffectStop) {
		try {
			s.backgroundEffectStop();
		} catch (_) {
			/* Stream may be locked */
		}
		patchState({ backgroundEffectStop: null });
		await new Promise((r) => setTimeout(r, 100));

		/* Generator ended, localStream may still carry dead video; find raw camera in base/local
		 * and briefly set state + producer to raw — else selectCameraVideoTrackForEffects / UI stall. */
		const stRep = getState();
		const device = selectFirstLiveDeviceVideoTrackFromStreams(selectBaseLocalStream(stRep), selectLocalStream(stRep));
		if (device && device.readyState === "live") {
			const audios = [...(selectLocalStream(stRep)?.getAudioTracks?.() ?? [])].filter((t) => t && t.readyState !== "ended");
			const repaired = new MediaStream([...audios, device]);
			const forRoom = prepareRoomLocalStream(repaired);
			patchState({
				baseLocalStream: new MediaStream([device]),
				localStream: forRoom
			});
			const participant = selectHostPeer(getState()) || selectViewerConn(getState());
			try {
				await participant?.updateLocalStream?.(forRoom);
			} catch (e) {
				console.warn("[easymeet] updateLocalStream after effect stop/repair:", e?.message || e);
			}
		} else if (selectIsVideoEnabled(stRep)) {
			await ensureCameraTrackWhenVideoEnabled();
		}

		mediaDebugLog("effect:after-prev-stop", {
			local: mediaDebugStreamInfo(selectLocalStream(getState())),
			base: mediaDebugStreamInfo(selectBaseLocalStream(getState())),
			cam: mediaDebugTrackInfo(selectCameraVideoTrackForEffects(getState()))
		});
	}

	s = getState();
	camTrack = selectCameraVideoTrackForEffects(s);
	if (!turningEffectOff && (!camTrack || camTrack.readyState === "ended")) {
		if (selectIsVideoEnabled(s)) {
			await ensureCameraTrackWhenVideoEnabled();
			s = getState();
			camTrack = selectCameraVideoTrackForEffects(s);
		}
		if (!turningEffectOff && (!camTrack || camTrack.readyState === "ended")) {
			mediaDebugLog("effect:call:abort", { reason: "no-cam-after-stop", cam: mediaDebugTrackInfo(camTrack) });
			return;
		}
	}

	/* Snapshots before await: during createBlurredStream localStream unchanged → tile/producer keep raw video.
	 * Then patchState: base = raw only, local = audio + generator (raw moves to base, never "audio only"). */
	const localPre = selectLocalStream(s);
	const audioTracksSnapshot = [...(localPre?.getAudioTracks?.() ?? [])];
	const rawTrackForBase = selectCameraVideoTrackForEffects(s);
	if (!turningEffectOff && (!rawTrackForBase || rawTrackForBase.readyState === "ended")) {
		mediaDebugLog("effect:call:abort", { reason: "no-raw-for-base", raw: mediaDebugTrackInfo(rawTrackForBase) });
		return;
	}

	const oldVideoTracks = [...(localPre?.getVideoTracks?.() ?? [])];
	/** Stop only tracks no longer present in current local/base — never wrongly stop raw via t!==protect. */
	const stopOldTracks = () => {
		const st = getState();
		const keep = new Set();
		const add = (stream) => {
			stream?.getVideoTracks?.()?.forEach((t) => keep.add(t));
			stream?.getAudioTracks?.()?.forEach((t) => keep.add(t));
		};
		add(selectLocalStream(st));
		add(selectBaseLocalStream(st));
		oldVideoTracks.forEach((t) => {
			if (!t || keep.has(t) || t.readyState === "ended") return;
			try {
				t.stop();
			} catch (_) {}
		});
	};

	/**
	 * Set baseLocalStream only when raw is not already alone in base (else shuffle raw between streams forever).
	 * Pipeline source is always `raw.clone()` (resolvePipelineSource).
	 */
	const patchEffectResult = (processedStream, stop, rawCanonical) => {
		const genTracks = processedStream.getVideoTracks();
		const st = getState();
		const curBase = selectBaseLocalStream(st);
		const baseIsOnlyRaw =
			curBase &&
			(curBase.getAudioTracks?.()?.length ?? 0) === 0 &&
			curBase.getVideoTracks()?.length === 1 &&
			curBase.getVideoTracks()[0] === rawCanonical &&
			rawCanonical.readyState !== "ended";

		if (baseIsOnlyRaw) {
			patchState({
				localStream: prepareRoomLocalStream(new MediaStream([...audioTracksSnapshot, ...genTracks])),
				backgroundEffectStop: stop
			});
		} else {
			patchState({
				baseLocalStream: new MediaStream([rawCanonical]),
				localStream: prepareRoomLocalStream(new MediaStream([...audioTracksSnapshot, ...genTracks])),
				backgroundEffectStop: stop
			});
		}
	};

	/**
	 * Always a dedicated clone as pipeline source (cleanup stops clone + inner chain only).
	 * Feeding base directly often lost raw track in Chromium after blur→other background /
	 * selector returned null (logs: video-track:ended on tile, no-cam-after-stop).
	 */
	const resolvePipelineSource = () => {
		const st = getState();
		const rawLive = selectCameraVideoTrackForEffects(st);
		if (!rawLive || rawLive.readyState === "ended") return null;
		try {
			return { stream: new MediaStream([rawLive.clone()]), stopSourceCleanup: true, rawCanonical: rawLive };
		} catch (e) {
			console.warn("[easymeet] camera track clone for effect failed:", e?.message || e);
			return null;
		}
	};

	try {
		if (effect === "blur" && isBackgroundEffectsSupported()) {
			const src = resolvePipelineSource();
			if (!src) {
				mediaDebugLog("effect:call:abort", { reason: "resolve-pipeline-null", branch: "blur" });
				return;
			}
			const { stream, stop } = await createBlurredStream(src.stream, {
				blurAmount: 15,
				stopSourceVideoTrackOnCleanup: src.stopSourceCleanup
			});
			patchEffectResult(stream, stop, src.rawCanonical);
		} else if (effect && effect !== "none" && isBackgroundEffectsSupported()) {
			const customResult = getCustomBackgrounds();
			const allBackgrounds = [...BACKGROUND_IMAGES, ...(customResult.success ? customResult.data : [])];
			const bg = allBackgrounds.find((b) => b.id === effect);
			if (bg?.url) {
				const src = resolvePipelineSource();
				if (!src) {
					mediaDebugLog("effect:call:abort", { reason: "resolve-pipeline-null", branch: "virtual-bg", effectId: effect });
					return;
				}
				const { stream, stop } = await createVirtualBackgroundStream(src.stream, bg.url, {
					stopSourceVideoTrackOnCleanup: src.stopSourceCleanup
				});
				patchEffectResult(stream, stop, src.rawCanonical);
			} else {
				const merged = buildMergedStreamAfterEffectOff();
				mediaDebugLog("effect:patch:merged", { branch: "unknown-bg-id", merged: mediaDebugStreamInfo(merged) });
				const m = merged ?? selectLocalStream(getState());
				patchState({
					localStream: m ? prepareRoomLocalStream(m) : m,
					baseLocalStream: merged ?? selectBaseLocalStream(getState()),
					backgroundEffectStop: null
				});
			}
		} else {
			let merged = buildMergedStreamAfterEffectOff();
			const stOff = getState();
			const hasLiveVideo = merged?.getVideoTracks?.()?.some((t) => t && t.readyState === "live");
			if (selectIsVideoEnabled(stOff) && !hasLiveVideo) {
				await ensureCameraTrackWhenVideoEnabled();
				merged = buildMergedStreamAfterEffectOff();
			}
			mediaDebugLog("effect:patch:merged", { branch: "effect-off", merged: mediaDebugStreamInfo(merged) });
			const mOff = merged ?? selectLocalStream(getState());
			patchState({
				localStream: mOff ? prepareRoomLocalStream(mOff) : mOff,
				baseLocalStream: merged ?? selectBaseLocalStream(getState()),
				backgroundEffectStop: null
			});
		}
		mediaDebugLog("effect:patch:done", {
			local: mediaDebugStreamInfo(selectLocalStream(getState())),
			base: mediaDebugStreamInfo(selectBaseLocalStream(getState()))
		});
	} catch (err) {
		console.error("background effect failed:", err);
		mediaDebugLog("effect:call:error", { message: err?.message, name: err?.name });
		let merged = buildMergedStreamAfterEffectOff();
		const stErr = getState();
		if (selectIsVideoEnabled(stErr) && !merged?.getVideoTracks?.()?.some((t) => t && t.readyState === "live")) {
			await ensureCameraTrackWhenVideoEnabled();
			merged = buildMergedStreamAfterEffectOff();
		}
		const mErr = merged ?? selectBaseLocalStream(getState());
		patchState({
			backgroundEffect: "none",
			localStream: mErr ? prepareRoomLocalStream(mErr) : mErr,
			baseLocalStream: merged ?? selectBaseLocalStream(getState()),
			backgroundEffectStop: null
		});
		updateEffectTilesSelection(app, "none");
		stopOldTracks();
		const peerId = selectMyPeerId(getState());
		if (peerId) attachRemoteAudio(peerId, selectLocalStream(getState()), app);
		return;
	}

	s = getState();
	const localStream = selectLocalStream(s);
	if (!localStream) {
		mediaDebugLog("effect:call:abort", { reason: "no-local-stream-after-patch" });
		return;
	}

	localStream.getAudioTracks().forEach((t) => {
		t.enabled = !selectIsMuted(s);
	});
	localStream.getVideoTracks().forEach((t) => {
		t.enabled = selectIsVideoEnabled(s) ?? true;
	});

	/* One frame gap: release old insertable pipe before producer/webcam re-wire (Chromium). */
	await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

	const sMedia = getState();
	localStream.getAudioTracks().forEach((t) => {
		t.enabled = !selectIsMuted(sMedia);
	});
	localStream.getVideoTracks().forEach((t) => {
		t.enabled = selectIsVideoEnabled(sMedia) ?? true;
	});

	const participant = selectHostPeer(sMedia) || selectViewerConn(sMedia);
	mediaDebugLog("effect:before-update-local-stream", {
		participant: Boolean(participant),
		stream: mediaDebugStreamInfo(localStream)
	});
	try {
		await participant?.updateLocalStream?.(localStream);
		mediaDebugLog("effect:after-update-local-stream", { ok: true });
	} catch (e) {
		console.warn("[easymeet] updateLocalStream after effect change:", e?.message || e);
		mediaDebugLog("effect:after-update-local-stream", { ok: false, error: e?.message || String(e) });
	}

	stopOldTracks();
	mediaDebugLog("effect:after-stop-old-tracks", {
		local: mediaDebugStreamInfo(selectLocalStream(getState())),
		base: mediaDebugStreamInfo(selectBaseLocalStream(getState()))
	});

	const sAfter = getState();
	const peerId = selectMyPeerId(sAfter);
	const streamForUi = selectLocalStream(sAfter) ?? localStream;
	if (peerId) {
		attachRemoteAudio(peerId, streamForUi, app);
		const hostPeer = selectHostPeer(sAfter);
		if (hostPeer) hostPeer.broadcastBackgroundEffect?.(peerId, effect);
		else selectViewerConn(sAfter)?.sendBackgroundEffect?.(effect);
	}

	const sUi = getState();
	if (selectScreen(sUi) === "room-view") {
		/* No navigate('room-view'): full re-render breaks settings preview + effect pipeline; VoIP update is enough. */
		updateVoipParticipants(
			app,
			selectVoipMembers(sUi),
			selectMyPeerId(sUi),
			selectIsMuted(sUi),
			selectScreenStreams(sUi),
			getStreamForPeerId,
			getStreamForScreenShare,
			selectPeerMuteState(sUi),
			selectPeerVolume(sUi),
			selectBackgroundEffect(sUi),
			selectPeerVideoState(sUi),
			selectIsVideoEnabled(sUi),
			selectPeerBackgroundEffect(sUi)
		);
	}
	updateEffectTilesSelection(app, selectBackgroundEffect(sUi) ?? effect);
	const previewVideo = app.querySelector("#effect-preview-video");
	const settingsModal = app.querySelector("#settings-modal");
	if (previewVideo && settingsModal && !settingsModal.hasAttribute("hidden")) {
		previewVideo.srcObject = null;
		previewVideo.srcObject = selectLocalStream(getState());
		previewVideo.play?.().catch(() => {});
	}
}

/**
 * Re-acquires audio stream when device was switched/removed (e.g. headset change).
 * (I/O & Side-Effect Schwer - Layer 4)
 */
export async function reacquireAudioStreamIfNeeded(app, attachRemoteAudio, setupAudioTrackEndedHandler) {
	const s = getState();
	if (selectScreen(s) !== "room-view" || !selectLocalStream(s)) return;
	if (selectIsMuted(s)) return; // No audio track needed when muted

	const audioTrack = selectLocalStream(s)?.getAudioTracks?.()[0];
	if (!audioTrack) return;
	if (audioTrack.readyState !== "ended") {
		const deviceId = audioTrack.getSettings?.()?.deviceId;
		if (deviceId) {
			const { inputs } = await peer.getAudioDevices().catch(() => ({ inputs: [] }));
			if (inputs.some((d) => d.deviceId === deviceId)) return; // Device still present
		} else return;
	}

	try {
		const { inputs } = await peer.getAudioDevices().catch(() => ({ inputs: [] }));
		const inputDeviceId = selectInputDeviceId(s);
		const newDeviceId = inputDeviceId && inputs.some((d) => d.deviceId === inputDeviceId) ? inputDeviceId : (inputs[0]?.deviceId ?? undefined);
		const newStream = await peer.getUserMediaResilient(newDeviceId, selectHasVideoSupport(s) ?? false, selectVideoDeviceId(s) || undefined);
		const newAudioTrack = newStream.getAudioTracks?.()[0];
		const newVideoTrack = newStream.getVideoTracks?.()[0];
		if (!newAudioTrack) return;
		const videoTrack = selectLocalStream(s)?.getVideoTracks?.()[0];
		const tracks = [newAudioTrack];
		if (newVideoTrack) {
			newVideoTrack.enabled = selectIsVideoEnabled(s) ?? false;
			tracks.push(newVideoTrack);
		} else if (videoTrack && videoTrack.readyState !== "ended") {
			tracks.push(videoTrack);
		}
		const oldStream = selectLocalStream(s);
		const newLocalStream = new MediaStream(tracks);
		newLocalStream.getAudioTracks().forEach((t) => {
			t.enabled = !selectIsMuted(s);
		});
		const savedInputDeviceId = newAudioTrack.getSettings?.()?.deviceId || newDeviceId || null;
		const forRoom = prepareRoomLocalStream(newLocalStream);
		patchState({ localStream: forRoom, baseLocalStream: newLocalStream, inputDeviceId: savedInputDeviceId });
		if (savedInputDeviceId) writeDeviceId(DEVICE_STORAGE.input, savedInputDeviceId);
		oldStream.getTracks().forEach((t) => {
			if (t === videoTrack && !newVideoTrack) return;
			t.stop();
		});
		selectHostPeer(s)?.updateLocalStream?.(forRoom);
		selectViewerConn(s)?.updateLocalStream?.(forRoom);
		const peerId = selectMyPeerId(s);
		if (peerId) attachRemoteAudio(peerId, forRoom);
		if (selectScreen(s) === "room-view" && peerId) {
			stopSpeakingIndicator(peerId);
			startSpeakingIndicator(peerId, forRoom, app);
		}
		setupAudioTrackEndedHandler(newAudioTrack);
	} catch (err) {
		console.warn("Audio re-acquisition after device change failed:", err);
	}
}
