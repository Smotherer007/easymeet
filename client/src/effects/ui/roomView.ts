/**
 * Effect: Room-View UI orchestration.
 * Bundles all handlers for the room view into small, focused functions.
 */

import { getState, patchState } from "../../store/index.js";
import * as selectors from "../../domain/selectors/index.js";
import { t } from "../../i18n.js";
import * as peer from "../network/mediasoupClient.js";
import { getTrendingGifs, hasGiphyKey, searchGifs } from "../../giphy.js";
import { extractDropData, processDropData, zipFileList } from "../../utils/folder-zip.js";
import { addCustomBackground, removeCustomBackground } from "../storage/customBackgroundStorage.js";
import { writeDeviceId } from "../storage/deviceStorage.js";
import { writeAudioSettings, getAudioProcessingConstraints } from "../storage/audioSettingsStorage.js";
import { writeBackgroundEffectsSettings } from "../storage/backgroundEffectsSettingsStorage.js";
import { DEVICE_STORAGE, VIDEO_LAYOUT_STORAGE, WINDOW_POSITIONS_STORAGE } from "../../shared/constants.js";
import { WINDOW_POSITION_DEFAULTS } from "../../shared/windowPositionsDefaults.js";
import { escapeHtml } from "../../shared/escape.js";
import {
	attachRoomViewListeners,
	updateVoipParticipants,
	updateMuteButton,
	updateVideoButton,
	updateEffectTilesSelection,
	updateChatBadge,
	updateFileShareMessage,
	updateMeetingScreenShareSlots,
	updateStreamModalHostActionSlots,
	updateScreenShareBannersSection
} from "../../ui/screens/index.js";
import { attachRemoteAudio, updateVideoGalleryColumns, getStreamForVideoTile, getStreamForScreenShare, getStreamForPeerId, applyOutputDeviceToAllAudios } from "../media/tiles.js";
import { applyEffectToCallStream, recoverCameraAfterEffectLoss } from "../media/devices.js";
import { prepareRoomLocalStream, disposeMicNoiseGate, getMicGateRawInputTrack, refreshMicGateSettings, setMicSelfMonitor } from "../audio/micNoiseGate.js";
import { startMicSilenceWatchdog } from "../audio/micSilenceWatchdog.js";
import { refreshDeviceSelects } from "./devices.js";
import { startSpeakingIndicator, stopSpeakingIndicator } from "../../speaking-indicator.js";
import { mediaDebugLog, mediaDebugStreamInfo, mediaDebugTrackInfo } from "../../utils/mediaDebug.js";
import { showToast } from "../../utils/toast.js";
import { POLL_CREATE_MAX_OPTIONS } from "../../ui/screens/room-view-renderers.js";
import { spawnFloatingReaction } from "./floatingReactions.js";
import { playReactionEffect } from "./reactionEffects.js";

/** DOMException.name → appropriate i18n key (not every error is permission denied). */
function alertMediaAccessError(err, kind) {
	const name = err?.name;
	const mapMic = {
		NotReadableError: "microphoneNotReadableError",
		NotFoundError: "microphoneNotFoundError",
		OverconstrainedError: "microphoneOverconstrainedError",
		ConstraintNotSatisfiedError: "microphoneOverconstrainedError",
		SecurityError: "microphoneSecurityError"
	};
	const mapCam = {
		NotReadableError: "cameraNotReadableError",
		NotFoundError: "cameraNotFoundError",
		OverconstrainedError: "cameraOverconstrainedError",
		ConstraintNotSatisfiedError: "cameraOverconstrainedError",
		SecurityError: "cameraSecurityError"
	};
	const map = kind === "video" ? mapCam : mapMic;
	const def = kind === "video" ? "cameraPermissionDenied" : "microphonePermissionDenied";
	alert(t(map[name] ?? def));
}

/**
 * Web Audio destination tracks (mic gate output) have no device behind them and no APM to
 * configure — `applyConstraints` rejects on them. Only real capture tracks carry a deviceId.
 * @param {MediaStreamTrack | null | undefined} track
 */
function isDeviceAudioTrack(track) {
	if (!track || track.kind !== "audio" || track.readyState !== "live") return false;
	const settings = track.getSettings?.() ?? {};
	return typeof settings.deviceId === "string" && settings.deviceId.length > 0;
}

/**
 * @param {MediaStream | null | undefined} stream
 * @returns {MediaStreamTrack | null}
 */
function firstLiveDeviceAudioTrack(stream) {
	return (stream?.getAudioTracks?.() ?? []).find((t) => isDeviceAudioTrack(t)) ?? null;
}

/**
 * Echo cancellation / noise suppression / AGC live on the *capture* track. With the gate active
 * that track is neither in `localStream` (destination track) nor reliably in `baseLocalStream`
 * (video-only after a camera re-acquire, gate track after a camera switch) — it only lives inside
 * the gate. Without it the three settings checkboxes silently did nothing in an active room.
 */
function applyLiveAudioProcessingToLocalTracks() {
	const proc = getAudioProcessingConstraints();
	const s = getState();
	const tracks = new Set();
	const raw = getMicGateRawInputTrack();
	if (raw) tracks.add(raw);
	for (const stream of [selectors.selectLocalStream(s), selectors.selectBaseLocalStream(s)]) {
		stream?.getAudioTracks?.().forEach((track) => tracks.add(track));
	}
	let applied = 0;
	for (const track of tracks) {
		if (!isDeviceAudioTrack(track)) continue;
		applied++;
		void track
			.applyConstraints({
				echoCancellation: proc.echoCancellation,
				noiseSuppression: proc.noiseSuppression,
				autoGainControl: proc.autoGainControl
			})
			.catch((e) => {
				console.warn("[easymeet] applyConstraints (audio processing) failed:", e?.name || e);
			});
	}
	if (!applied) {
		console.warn("[easymeet] audio processing settings: no live capture track — applies on next microphone access");
	}
}

/**
 * Gate on/off changes which track is sent (gate destination ↔ raw mic), so the stream has to be
 * rebuilt and the mic producer recreated.
 * @param {HTMLElement} app
 */
async function applyMicGateToggleToCall(app) {
	refreshMicGateSettings();
	const s = getState();
	if (selectors.selectScreen(s) !== "room-view") return;
	const local = selectors.selectLocalStream(s);
	const raw =
		getMicGateRawInputTrack() ||
		firstLiveDeviceAudioTrack(selectors.selectBaseLocalStream(s)) ||
		firstLiveDeviceAudioTrack(local);
	if (!raw) return;
	const videos = (local?.getVideoTracks?.() ?? []).filter((t) => t && t.readyState !== "ended");
	const muted = selectors.selectIsMuted(s);
	const rebuilt = prepareRoomLocalStream(new MediaStream([raw, ...videos]));
	rebuilt.getAudioTracks().forEach((t) => {
		t.enabled = !muted;
	});
	patchState({ localStream: rebuilt });
	const out = selectors.selectLocalStream(getState());
	const participant = selectors.selectHostPeer(getState()) || selectors.selectViewerConn(getState());
	try {
		await participant?.updateLocalStream?.(out, { forceMicProducer: true });
	} catch (e) {
		console.warn("[easymeet] updateLocalStream after mic gate toggle:", e?.message || e);
	}
	const myPeerId = selectors.selectMyPeerId(getState());
	if (myPeerId) {
		attachRemoteAudio(myPeerId, out, app);
		stopSpeakingIndicator(myPeerId);
		startSpeakingIndicator(myPeerId, out, app);
	}
	/* The browser filters only reach a real capture track — in bypass mode that is now the
	 * outgoing track, so re-apply the stored settings. */
	applyLiveAudioProcessingToLocalTracks();
}

function handleAudioSettingsChange(app, partial) {
	const merged = writeAudioSettings(partial);
	patchState({ audioSettings: merged });
	if (partial.noiseSuppression !== undefined || partial.echoCancellation !== undefined || partial.autoGainControl !== undefined) {
		applyLiveAudioProcessingToLocalTracks();
	}
	if (partial.speakingThreshold !== undefined) {
		refreshMicGateSettings();
	}
	if (partial.micGate !== undefined) {
		void applyMicGateToggleToCall(app);
	}
	if (partial.micMonitor !== undefined) {
		setMicSelfMonitor(!!partial.micMonitor);
	}
}

async function handleBackgroundEffectsSettingsChange(app, partial, applyEffectToCallStream, applyEffectToPreview, navigate) {
	const merged = writeBackgroundEffectsSettings(partial);
	patchState({ backgroundEffectsSettings: merged });
	const state = getState();
	const effect = selectors.selectBackgroundEffect(state) || "none";
	if (selectors.selectSettingsPanelOpen(state)) {
		const previewVideo = app.querySelector("#effect-preview-video");
		const source = selectors.selectIsVideoEnabled(state)
			? selectors.selectLocalStream(state)
			: selectors.selectPreviewStream(state);
		if (previewVideo && source?.getVideoTracks?.()?.length) {
			await applyEffectToPreview(source, effect, previewVideo);
		}
	}
	if (effect !== "none" && selectors.selectIsVideoEnabled(state)) {
		await applyEffectToCallStream(
			effect,
			app,
			attachRemoteAudio,
			updateVoipParticipants,
			updateEffectTilesSelection,
			getStreamForPeerId,
			getStreamForScreenShare,
			navigate
		);
	}
}

function setupDropzone(el, onFileSelect) {
	if (!el) return;
	el.addEventListener("dragover", (e) => {
		e.preventDefault();
		el.classList.add("dragover");
	});
	el.addEventListener("dragleave", () => el.classList.remove("dragover"));
	el.addEventListener("drop", async (e) => {
		e.preventDefault();
		el.classList.remove("dragover");
		const { files, dirs } = extractDropData(e.dataTransfer?.items);
		const processed = await processDropData({ files, dirs });
		if (processed?.length) onFileSelect(processed);
	});
}

function setupFullscreenButton(app) {
	const btn = app.querySelector("#stream-fullscreen-btn");
	if (!btn) return;
	btn.onclick = () => {
		const wrap = app.querySelector(".stream-modal__video-wrap");
		if (wrap) !document.fullscreenElement ? wrap.requestFullscreen?.() : document.exitFullscreen?.();
	};
}

function setupPipButton(app) {
	const btn = app.querySelector("#stream-pip-btn");
	if (!btn) return;
	btn.onclick = async () => {
		const vid = app.querySelector("#stream-modal-video");
		if (vid) {
			try {
				if (document.pictureInPictureElement) await document.exitPictureInPicture();
				else await vid.requestPictureInPicture();
			} catch (_) {}
		}
	};
}

function syncStreamThumbs(app) {
	app.querySelectorAll(".voip-view__stream-thumb").forEach((thumb) => {
		const participant = thumb.closest(".voip-view__participant");
		const peerId = participant?.dataset?.peerId;
		thumb.disablePictureInPicture = true;
		thumb.srcObject = peerId ? getStreamForScreenShare(peerId) : null;
	});
}

function syncModalVideo(app) {
	const modal = app.querySelector("#stream-modal");
	const modalVideo = app.querySelector("#stream-modal-video");
	if (modalVideo && modal && !modal.hasAttribute("hidden")) {
		const peerId = modal.dataset?.streamPeerId;
		modalVideo.srcObject = peerId ? getStreamForScreenShare(peerId) : null;
	}
}

/**
 * Screen-share UI without full re-render (no navigate('room-view')).
 * @param {{ skipVoip?: boolean }} [options] — after voip/* events the participant list is already current via handleVoipOrRoomUpdate.
 */
export function patchMeetingScreenSharePresentation(app, options = {}) {
	const { skipVoip = false } = options;
	const state = getState();
	const myPeerId = selectors.selectMyPeerId(state);
	if (!skipVoip) {
		updateVoipParticipants(
			app,
			selectors.selectVoipMembers(state),
			myPeerId,
			selectors.selectIsMuted(state),
			selectors.selectScreenStreams(state),
			getStreamForPeerId,
			getStreamForScreenShare,
			selectors.selectPeerMuteState(state),
			selectors.selectPeerVolume(state),
			selectors.selectBackgroundEffect(state),
			selectors.selectPeerVideoState(state),
			selectors.selectIsVideoEnabled(state),
			selectors.selectPeerBackgroundEffect(state)
		);
	}
	syncStreamThumbs(app);
	syncModalVideo(app);
	updateScreenShareBannersSection(app, selectors.selectScreenStreams(state), myPeerId);
	const hasScreenShareSupport = typeof navigator.mediaDevices?.getDisplayMedia === "function";
	updateMeetingScreenShareSlots(app, {
		hasScreenShareSupport,
		hostStream: selectors.selectHostStream(state)
	});
	updateStreamModalHostActionSlots(app, {
		isHost: selectors.selectIsHost(state),
		hostStream: selectors.selectHostStream(state),
		audioEnabled: selectors.selectAudioEnabled(state)
	});
	setupFullscreenButton(app);
	setupPipButton(app);
}

async function handleCustomBackgroundUpload(app, file, navigate) {
	const result = await addCustomBackground(file);
	if (!result.success) {
		alert(result.error.message || t("customBackgroundUploadFailed"));
		return;
	}
	patchState({ settingsPanelOpen: true });
	navigate("room-view");
}

function handleRemoveCustomBackground(app, id, navigate) {
	const current = selectors.selectBackgroundEffect(getState());
	if (current === id) {
		patchState({ backgroundEffect: "none" });
		applyEffectToCallStream("none", app, attachRemoteAudio, updateVoipParticipants, updateEffectTilesSelection, getStreamForPeerId, getStreamForScreenShare, navigate);
	}
	const result = removeCustomBackground(id);
	if (!result.success) {
		console.warn("remove custom background failed:", result.error?.message);
	}
	navigate("room-view");
}

function handleDownloadFile(fileId) {
	const entry = selectors.selectReceivedFileBlob(getState(), fileId);
	if (entry?.blob) {
		const url = URL.createObjectURL(entry.blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = entry.filename || "download";
		a.click();
		URL.revokeObjectURL(url);
	}
}

function snapWindowCoord(n, grid = 12) {
	return Math.round(Number(n) / grid) * grid;
}

function handleWindowMove(windowId, pos) {
	const snapped = { ...pos, x: snapWindowCoord(pos.x), y: snapWindowCoord(pos.y) };
	const wp = selectors.selectWindowPositions(getState());
	const positions = { ...wp, [windowId]: { ...(wp[windowId] || {}), ...snapped } };
	patchState({ windowPositions: positions });
	try {
		localStorage.setItem(WINDOW_POSITIONS_STORAGE, JSON.stringify(positions));
	} catch (_) {}
}

function handleWindowResize(windowId, positions) {
	patchState({ windowPositions: positions });
	try {
		localStorage.setItem(WINDOW_POSITIONS_STORAGE, JSON.stringify(positions));
	} catch (_) {}
}

function handleOpenStreamModal(app, peerId) {
	const stream = getStreamForScreenShare(peerId);
	const modal = app.querySelector("#stream-modal");
	const vid = app.querySelector("#stream-modal-video");
	const titleEl = app.querySelector("#stream-modal-title");
	if (modal && vid && stream) {
		vid.srcObject = stream;
		vid.muted = peerId === selectors.selectMyPeerId(getState());
		modal.dataset.streamPeerId = peerId ?? "";
		if (titleEl) titleEl.textContent = `${selectors.selectNickForPeerId(getState(), peerId)} – ${t("screenStream")}`;
		modal.removeAttribute("hidden");
	}
}

/**
 * Toolbar "stop screen share": with an active own stream, open stream modal first;
 * only on second click (when modal already shows own share) actually stop.
 * Without hostStream the button still only uses {@link handleStartScreen}.
 */
function handleStopScreenToolbar(app, handleStopScreen) {
	const s = getState();
	if (!selectors.selectHostStream(s)) return;
	const myPeerId = selectors.selectMyPeerId(s);
	if (myPeerId == null || myPeerId === "") return;
	const modal = app.querySelector("#stream-modal");
	const modalOpen = modal && !modal.hasAttribute("hidden");
	const ds = modal?.dataset?.streamPeerId ?? "";
	const showingMyShare = modalOpen && ds !== "" && ds === String(myPeerId);
	if (showingMyShare) {
		handleStopScreen();
		return;
	}
	handleOpenStreamModal(app, myPeerId);
}

async function handleShareOpen(app, getJoinUrl) {
	const canvas = app.querySelector("#share-qr-canvas");
	const roomId = selectors.selectRoomId(getState());
	if (canvas && roomId) {
		const QRCode = (await import("qrcode")).default;
		try {
			await QRCode.toCanvas(canvas, getJoinUrl(roomId), { width: 200, margin: 2 });
		} catch (_) {}
	}
}

function sendChatMessage(handlers) {
	const txt = handlers.getInputValue?.() ?? "";
	const gifs = handlers._pendingGifs ?? [];
	if (!txt.trim() && !gifs.length) return;
	const ts = Date.now();
	const nick = selectors.selectNickname(getState()) ?? "?";
	const giphyUrls = gifs.map((g) => g.url);
	const hostPeer = selectors.selectHostPeer(getState());
	const viewerConn = selectors.selectViewerConn(getState());
	if (hostPeer) hostPeer.sendChat(nick, txt, ts, giphyUrls);
	else if (viewerConn?.sendChat) viewerConn.sendChat(nick, txt, ts, giphyUrls);
	handlers.clearInput?.();
	handlers._pendingGifs = [];
	handlers.setGiphyPreview?.([]);
}

/**
 * mediasoup: join/create often runs before localStream exists — then produceLocalTracks()
 * creates no producers. On first room view open, acquire media and trigger updateLocalStream
 * (same as after manual mute/camera toggle).
 */
async function ensureInitialCallMedia(app, deps) {
	const { setupAudioTrackEndedHandler } = deps;
	const state = getState();
	const participant = selectors.selectHostPeer(state) || selectors.selectViewerConn(state);
	if (!participant?.updateLocalStream) return;

	let localStream = selectors.selectLocalStream(state);
	const isMuted = selectors.selectIsMuted(state);
	const isVideoEnabled = selectors.selectIsVideoEnabled(state);

	if (localStream?.getTracks?.()?.length) {
		const needAudio = !isMuted && !localStream.getAudioTracks?.()?.some((t) => t.readyState === "live");
		const needVideo = isVideoEnabled && !localStream.getVideoTracks?.()?.some((t) => t.readyState === "live");
		if (!needAudio && !needVideo) {
			syncMuteToPeers(app);
			if (selectors.selectIsVideoEnabled(getState())) syncVideoToPeers(app);
			return;
		}
		if (needAudio) {
			try {
				const micStream = await peer.getUserMediaResilient(selectors.selectInputDeviceId(state) || undefined, false, undefined);
				const mic = micStream.getAudioTracks?.()[0];
				micStream.getVideoTracks?.().forEach((t) => t.stop());
				if (mic && mic.readyState !== "ended") {
					const liveVideo = localStream.getVideoTracks?.().filter((t) => t.readyState === "live") ?? [];
					const lv = liveVideo[0];
					const bv = selectors.selectBaseLocalStream(state)?.getVideoTracks?.()?.[0];
					const videoForLocal = lv;
					const videoForBase = bv && lv && bv !== lv ? bv : lv;
					const mergedLocal = new MediaStream([mic, ...(videoForLocal ? [videoForLocal] : [])]);
					const mergedBase = new MediaStream([mic, ...(videoForBase ? [videoForBase] : [])]);
					mergedLocal.getAudioTracks().forEach((t) => {
						t.enabled = !isMuted;
					});
					mergedLocal.getVideoTracks().forEach((t) => {
						t.enabled = isVideoEnabled;
					});
					mergedBase.getAudioTracks().forEach((t) => {
						t.enabled = !isMuted;
					});
					mergedBase.getVideoTracks().forEach((t) => {
						t.enabled = isVideoEnabled;
					});
					patchState({
						localStream: prepareRoomLocalStream(mergedLocal),
						baseLocalStream: mergedBase,
						hasVideoSupport: isVideoEnabled || mergedLocal.getVideoTracks().length > 0
					});
					setupAudioTrackEndedHandler(mic);
				} else {
					micStream.getTracks().forEach((t) => t.stop());
				}
			} catch (e) {
				console.warn("ensureInitialCallMedia: mic reload failed:", e?.message || e);
			}
		}
		syncMuteToPeers(app);
		if (selectors.selectIsVideoEnabled(getState())) syncVideoToPeers(app);
		/* Pegel: attachRemoteAudio in syncMuteToPeers */
		return;
	}

	if (isMuted && !isVideoEnabled) return;

	let newStream;
	try {
		if (!isMuted && isVideoEnabled) {
			newStream = await peer.getUserMediaResilient(selectors.selectInputDeviceId(state) || undefined, true, selectors.selectVideoDeviceId(state) || undefined);
		} else if (!isMuted) {
			newStream = await peer.getUserMediaResilient(selectors.selectInputDeviceId(state) || undefined, false, undefined);
		} else {
			newStream = await peer.getUserMediaResilient(selectors.selectInputDeviceId(state) || undefined, "videoOnly", selectors.selectVideoDeviceId(state) || undefined);
		}
	} catch (err) {
		console.warn("first media setup (mediasoup):", err?.message || err);
		return;
	}

	if (!newStream?.getTracks?.()?.length) return;

	newStream.getAudioTracks().forEach((t) => {
		t.enabled = !isMuted;
	});
	newStream.getVideoTracks().forEach((t) => {
		t.enabled = isVideoEnabled;
	});

	patchState({
		localStream: prepareRoomLocalStream(newStream),
		baseLocalStream: newStream,
		hasVideoSupport: isVideoEnabled || newStream.getVideoTracks().length > 0
	});

	const audioTrack = newStream.getAudioTracks()[0];
	if (audioTrack && audioTrack.readyState !== "ended") setupAudioTrackEndedHandler(audioTrack);

	syncMuteToPeers(app);
	if (selectors.selectIsVideoEnabled(getState())) syncVideoToPeers(app);

	/* Pegel: attachRemoteAudio in syncMuteToPeers */
}

const ROOM_MEDIA_LATENCY_POLL_MS = 2000;

function clearRoomMediaLatencyTimer(app) {
	if (app._easymeetMediaLatencyTimer) {
		clearInterval(app._easymeetMediaLatencyTimer);
		app._easymeetMediaLatencyTimer = null;
	}
	const el = app.querySelector("#room-view-media-latency");
	if (el) {
		el.textContent = t("roomMediaLatencyNone");
		el.classList.remove("room-view__media-latency--good", "room-view__media-latency--fair", "room-view__media-latency--poor");
		el.setAttribute("aria-label", t("roomMediaLatencyTitle"));
	}
}

function applyMediaLatencyPresentation(el, { line, quality, ariaLabel }) {
	el.textContent = line;
	el.classList.remove("room-view__media-latency--good", "room-view__media-latency--fair", "room-view__media-latency--poor");
	if (quality === "good") el.classList.add("room-view__media-latency--good");
	else if (quality === "fair") el.classList.add("room-view__media-latency--fair");
	else if (quality === "poor") el.classList.add("room-view__media-latency--poor");
	if (ariaLabel) el.setAttribute("aria-label", ariaLabel);
}

function startRoomMediaLatencyDisplay(app) {
	clearRoomMediaLatencyTimer(app);
	/** Last valid snapshot — getStats often returns RTT/loss late or briefly null */
	let lastStatsSnapshot = null;
	let lastGoodMs = null;
	const tick = async () => {
		const el = app.querySelector("#room-view-media-latency");
		if (!el) return;
		const hp = selectors.selectHostPeer(getState());
		const fnStats = hp?.getWebRtcConnectionStats;
		const fnRtt = hp?.getWebRtcRttMs;

		if (typeof fnStats === "function") {
			const stats = await fnStats().catch(() => null);
			if (stats && stats.rttMs != null && stats.rttMs >= 0) lastStatsSnapshot = stats;
			const show = stats?.rttMs != null && stats.rttMs >= 0 ? stats : lastStatsSnapshot;
			if (!show || show.rttMs == null || show.rttMs < 0) {
				el.textContent = t("roomMediaLatencyNone");
				el.classList.remove("room-view__media-latency--good", "room-view__media-latency--fair", "room-view__media-latency--poor");
				el.setAttribute("aria-label", t("roomMediaLatencyTitle"));
				return;
			}
			const q =
				show.quality === "good" || show.quality === "fair" || show.quality === "poor" ? show.quality : "good";
			const ratingWord =
				q === "good" ? t("connectionRatingGood") : q === "fair" ? t("connectionRatingFair") : t("connectionRatingPoor");
			const line = t("roomMediaLatencyLine").replace("{ms}", String(show.rttMs)).replace("{rating}", ratingWord);
			const lossNote =
				show.packetLossPercent != null
					? t("roomMediaLatencyAriaLoss").replace("{p}", String(Math.round(show.packetLossPercent * 10) / 10))
					: "";
			const aria = t("roomMediaLatencyAria").replace("{ms}", String(show.rttMs)).replace("{rating}", ratingWord) + (lossNote ? " " + lossNote : "");
			applyMediaLatencyPresentation(el, { line, quality: q, ariaLabel: aria });
			return;
		}

		if (typeof fnRtt !== "function") {
			el.textContent = t("roomMediaLatencyNone");
			el.classList.remove("room-view__media-latency--good", "room-view__media-latency--fair", "room-view__media-latency--poor");
			el.setAttribute("aria-label", t("roomMediaLatencyTitle"));
			return;
		}
		const ms = await fnRtt().catch(() => null);
		if (ms != null && ms >= 0) lastGoodMs = ms;
		const showMs = ms != null && ms >= 0 ? ms : lastGoodMs;
		if (showMs == null || showMs < 0) {
			el.textContent = t("roomMediaLatencyNone");
			el.classList.remove("room-view__media-latency--good", "room-view__media-latency--fair", "room-view__media-latency--poor");
			el.setAttribute("aria-label", t("roomMediaLatencyTitle"));
			return;
		}
		const showQ = showMs <= 110 ? "good" : showMs <= 220 ? "fair" : "poor";
		const ratingWord =
			showQ === "good" ? t("connectionRatingGood") : showQ === "fair" ? t("connectionRatingFair") : t("connectionRatingPoor");
		const line = t("roomMediaLatencyLine").replace("{ms}", String(showMs)).replace("{rating}", ratingWord);
		const aria = t("roomMediaLatencyAria").replace("{ms}", String(showMs)).replace("{rating}", ratingWord);
		applyMediaLatencyPresentation(el, { line, quality: showQ, ariaLabel: aria });
	};
	void tick();
	app._easymeetMediaLatencyTimer = setInterval(() => void tick(), ROOM_MEDIA_LATENCY_POLL_MS);
}

/** Stop interval when leaving the room (bootstrap). */
export function stopRoomMediaLatencyDisplay(app) {
	clearRoomMediaLatencyTimer(app);
}

function runInitialRoomSetup(app, deps) {
	const state = getState();
	let localStream = selectors.selectLocalStream(state);
	if (localStream?.getAudioTracks?.()?.some((t) => t && t.readyState === "live")) {
		localStream = prepareRoomLocalStream(localStream);
		patchState({ localStream });
	}
	const myPeerId = selectors.selectMyPeerId(state);
	/* Speaking indicator only from attachRemoteAudio (live audio) — no second call with empty localStream */
	if (localStream && myPeerId) attachRemoteAudio(myPeerId, localStream, app);
	selectors.selectRemoteStreams(state).forEach((stream, peerId) => {
		attachRemoteAudio(peerId, stream, app);
	});
	updateVideoGalleryColumns();
	syncStreamThumbs(app);
	syncModalVideo(app);
	setupFullscreenButton(app);
	setupPipButton(app);
	startRoomMediaLatencyDisplay(app);
	void ensureInitialCallMedia(app, deps)
		.then(() => {
			const st = getState();
			if (!selectors.selectIsVideoEnabled(st)) return undefined;
			const ls = selectors.selectLocalStream(st);
			if (!ls?.getVideoTracks?.()?.some((t) => t && t.readyState === "live")) return undefined;
			const eff = selectors.selectBackgroundEffect(st) ?? "none";
			return applyEffectToCallStream(
				eff,
				app,
				attachRemoteAudio,
				updateVoipParticipants,
				updateEffectTilesSelection,
				getStreamForPeerId,
				getStreamForScreenShare,
				deps.navigate
			);
		})
		.catch((e) => console.warn("ensureInitialCallMedia / outgoing-orientation", e));
}

const TOOLBAR_MINIMIZE_MS = 400;

function toolbarChatBtn(app) {
	return app.querySelector('.meeting-control-bar [data-action="toggle-chat-panel"]');
}

function toolbarParticipantsBtn(app) {
	return app.querySelector('.meeting-control-bar [data-action="toggle-sidebar"]');
}

function toolbarLayoutBtn(app) {
	return app.querySelector('.meeting-control-bar [data-action="toggle-video-layout"]');
}

function toolbarVideoBtn(app) {
	return app.querySelector('.meeting-control-bar [data-action="toggle-video"]');
}

function toolbarSettingsBtn(app) {
	return app.querySelector('.meeting-control-bar [data-action="toggle-settings"]');
}

function toolbarShareBtn(app) {
	return app.querySelector('.meeting-control-bar [data-action="share"]');
}

function toolbarPollsBtn(app) {
	return app.querySelector('.meeting-control-bar [data-action="toggle-polls-panel"]');
}

function toolbarScreenBtn(app) {
	return app.querySelector(".meeting-control-bar #stop-screen-btn") || app.querySelector(".meeting-control-bar #start-screen-btn");
}

/** Floating windows via class — avoid navigate('room-view') or the whole UI flickers. */
function setFreeFloatingWindowHidden(app, windowId, hidden) {
	const el = app.querySelector(`.floating-window[data-window="${windowId}"]`);
	if (el) el.classList.toggle("floating-window--hidden", hidden);
}

function clearToolbarMinimizeMotion(el) {
	if (!el) return;
	el.classList.remove(
		"floating-window--minimize-out",
		"floating-window--minimize-out--run",
		"floating-window--minimize-in",
		"floating-window--minimize-in--from",
		"floating-window--minimize-in--run"
	);
	el.style.removeProperty("--min-dx");
	el.style.removeProperty("--min-dy");
}

/**
 * @param {HTMLElement} app
 * @param {HTMLElement | null} movingEl
 * @param {(a: HTMLElement) => Element | null | undefined} getChip
 * @param {() => void} [after]
 */
function runMinimizeToToolbar(app, movingEl, getChip, after) {
	const chip = getChip?.(app);
	if (!movingEl || movingEl.classList.contains("floating-window--hidden") || !chip) {
		after?.();
		return;
	}
	if (movingEl.classList.contains("floating-window--minimize-out")) {
		after?.();
		return;
	}
	const wr = movingEl.getBoundingClientRect();
	const cr = chip.getBoundingClientRect();
	const wcx = wr.left + wr.width / 2;
	const wcy = wr.top + wr.height / 2;
	const ccx = cr.left + cr.width / 2;
	const ccy = cr.top + cr.height / 2;
	movingEl.style.setProperty("--min-dx", `${ccx - wcx}px`);
	movingEl.style.setProperty("--min-dy", `${ccy - wcy}px`);
	movingEl.classList.add("floating-window--minimize-out");
	let finished = false;
	const cleanup = () => {
		if (finished) return;
		finished = true;
		movingEl.removeEventListener("transitionend", onEnd);
		clearTimeout(tid);
		clearToolbarMinimizeMotion(movingEl);
		after?.();
	};
	const onEnd = (e) => {
		if (e.target !== movingEl) return;
		if (e.propertyName !== "transform" && e.propertyName !== "opacity") return;
		cleanup();
	};
	movingEl.addEventListener("transitionend", onEnd);
	const tid = setTimeout(cleanup, TOOLBAR_MINIMIZE_MS + 120);
	requestAnimationFrame(() => {
		requestAnimationFrame(() => movingEl.classList.add("floating-window--minimize-out--run"));
	});
}

/**
 * @param {HTMLElement} app
 * @param {HTMLElement | null} movingEl
 * @param {(a: HTMLElement) => Element | null | undefined} getChip
 */
function runExpandFromToolbar(app, movingEl, getChip) {
	const chip = getChip?.(app);
	clearToolbarMinimizeMotion(movingEl);
	if (!movingEl || !chip) return;
	const wr = movingEl.getBoundingClientRect();
	const cr = chip.getBoundingClientRect();
	const wcx = wr.left + wr.width / 2;
	const wcy = wr.top + wr.height / 2;
	const ccx = cr.left + cr.width / 2;
	const ccy = cr.top + cr.height / 2;
	movingEl.style.setProperty("--min-dx", `${ccx - wcx}px`);
	movingEl.style.setProperty("--min-dy", `${ccy - wcy}px`);
	movingEl.classList.add("floating-window--minimize-in", "floating-window--minimize-in--from");
	let finished = false;
	const cleanup = () => {
		if (finished) return;
		finished = true;
		movingEl.removeEventListener("transitionend", onEnd);
		clearTimeout(tid);
		clearToolbarMinimizeMotion(movingEl);
	};
	const onEnd = (e) => {
		if (e.target !== movingEl) return;
		if (e.propertyName !== "transform" && e.propertyName !== "opacity") return;
		cleanup();
	};
	movingEl.addEventListener("transitionend", onEnd);
	const tid = setTimeout(cleanup, TOOLBAR_MINIMIZE_MS + 120);
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			movingEl.classList.remove("floating-window--minimize-in--from");
			movingEl.classList.add("floating-window--minimize-in--run");
		});
	});
}

function minimizeShareModalToToolbar(app) {
	const content = app.querySelector("#share-modal:not([hidden]) .share-modal__content");
	runMinimizeToToolbar(app, content, toolbarShareBtn, () => {
		app.querySelector("#share-modal")?.setAttribute("hidden", "");
	});
}

function minimizePollsModalToToolbar(app) {
	const content = app.querySelector("#polls-modal:not([hidden]) .polls-modal__content");
	runMinimizeToToolbar(app, content, toolbarPollsBtn, () => {
		app.querySelector("#polls-modal")?.setAttribute("hidden", "");
	});
}

function openPollsPanelFromToolbar(app) {
	const modal = app.querySelector("#polls-modal");
	const content = modal?.querySelector(".polls-modal__content");
	if (!modal || !content) return;
	modal.removeAttribute("hidden");
	clearToolbarMinimizeMotion(content);
	runExpandFromToolbar(app, content, toolbarPollsBtn);
}

function openFreeLayoutVideosPanel(app) {
	if (selectors.selectVideoLayoutMode(getState()) !== "free") return;
	if (getState().freeLayoutVideosOpen) return;
	patchState({ freeLayoutVideosOpen: true });
	const win = app.querySelector('.floating-window[data-window="videos"]');
	clearToolbarMinimizeMotion(win);
	setFreeFloatingWindowHidden(app, "videos", false);
	runExpandFromToolbar(app, win, toolbarVideoBtn);
}

function handleToggleVideoLayout(app, navigate) {
	const mode = selectors.selectVideoLayoutMode(getState());
	/* Minimized video panel: layout button switches to grid (restore only via camera icon). */
	if (mode === "free" && !getState().freeLayoutVideosOpen) {
		patchState({ videoLayoutMode: "grid" });
		try {
			localStorage.setItem(VIDEO_LAYOUT_STORAGE, "grid");
		} catch (_) {}
		navigate("room-view");
		selectors.selectVoipMembers(getState()).forEach((m) => {
			const stream = getStreamForVideoTile(m.peerId);
			if (stream) attachRemoteAudio(m.peerId, stream, app);
		});
		return;
	}
	const next = mode === "grid" ? "free" : "grid";
	if (next === "free" && typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches) {
		showToast(t("freeLayoutUnavailableMobile"), { type: "warning", duration: 3800 });
		return;
	}
	patchState({
		videoLayoutMode: next,
		/* Switching to free layout: do not auto-expand chat/participants; keep videos visible */
		...(next === "free" ? { freeLayoutChatOpen: false, freeLayoutParticipantsOpen: false, freeLayoutVideosOpen: true } : {})
	});
	try {
		localStorage.setItem(VIDEO_LAYOUT_STORAGE, next);
	} catch (_) {}
	navigate("room-view");
	selectors.selectVoipMembers(getState()).forEach((m) => {
		const stream = getStreamForVideoTile(m.peerId);
		if (stream) attachRemoteAudio(m.peerId, stream, app);
	});
}

function buildRoomViewConfigNav(app, deps) {
	const { cleanupAndNavigate, getJoinUrl, navigate } = deps;

	const minimizeFloatingVideos = () => {
		if (!getState().freeLayoutVideosOpen) return;
		patchState({ freeLayoutVideosOpen: false });
		const win = app.querySelector('.floating-window[data-window="videos"]');
		runMinimizeToToolbar(app, win, toolbarVideoBtn, () => {
			setFreeFloatingWindowHidden(app, "videos", true);
		});
	};

	const minimizeFloatingChat = () => {
		if (!getState().freeLayoutChatOpen) return;
		patchState({ freeLayoutChatOpen: false });
		const win = app.querySelector('.floating-window[data-window="chat"]');
		runMinimizeToToolbar(app, win, toolbarChatBtn, () => {
			setFreeFloatingWindowHidden(app, "chat", true);
		});
	};

	const openFloatingChat = () => {
		if (getState().freeLayoutChatOpen) return;
		patchState({ freeLayoutChatOpen: true, unreadChatCount: 0 });
		updateChatBadge(app, 0);
		const win = app.querySelector('.floating-window[data-window="chat"]');
		clearToolbarMinimizeMotion(win);
		setFreeFloatingWindowHidden(app, "chat", false);
		runExpandFromToolbar(app, win, toolbarChatBtn);
	};

	const toggleFloatingChat = () => {
		if (getState().freeLayoutChatOpen) minimizeFloatingChat();
		else openFloatingChat();
	};

	const minimizeFloatingParticipants = () => {
		if (!getState().freeLayoutParticipantsOpen) return;
		patchState({ freeLayoutParticipantsOpen: false });
		const win = app.querySelector('.floating-window[data-window="participants"]');
		runMinimizeToToolbar(app, win, toolbarParticipantsBtn, () => {
			setFreeFloatingWindowHidden(app, "participants", true);
		});
	};

	const openFloatingParticipants = () => {
		if (getState().freeLayoutParticipantsOpen) return;
		patchState({ freeLayoutParticipantsOpen: true });
		const win = app.querySelector('.floating-window[data-window="participants"]');
		clearToolbarMinimizeMotion(win);
		setFreeFloatingWindowHidden(app, "participants", false);
		runExpandFromToolbar(app, win, toolbarParticipantsBtn);
	};

	const toggleFloatingParticipants = () => {
		if (getState().freeLayoutParticipantsOpen) minimizeFloatingParticipants();
		else openFloatingParticipants();
	};

	return {
		onLeave: () => cleanupAndNavigate("landing"),
		onChatPanelOpen: () => {
			patchState({ unreadChatCount: 0 });
			updateChatBadge(app, 0);
		},
		onFloatingChatToggle: toggleFloatingChat,
		onMinimizeFloatingChat: minimizeFloatingChat,
		onFloatingParticipantsToggle: toggleFloatingParticipants,
		onMinimizeFloatingParticipants: minimizeFloatingParticipants,
		onMinimizeFloatingVideos: minimizeFloatingVideos,
		onFloatingChatClose: () => {
			patchState({ freeLayoutChatOpen: false });
			setFreeFloatingWindowHidden(app, "chat", true);
		},
		onFloatingParticipantsClose: () => {
			patchState({ freeLayoutParticipantsOpen: false });
			setFreeFloatingWindowHidden(app, "participants", true);
		},
		onDismissFloatingMobileOverlays: () => {
			patchState({ freeLayoutChatOpen: false, freeLayoutParticipantsOpen: false, freeLayoutVideosOpen: false });
			app.querySelectorAll(".floating-window[data-window]").forEach((w) => clearToolbarMinimizeMotion(w));
			setFreeFloatingWindowHidden(app, "chat", true);
			setFreeFloatingWindowHidden(app, "participants", true);
			setFreeFloatingWindowHidden(app, "videos", true);
		},
		onFloatingChatMouseDown: () => {
			if (!getState().freeLayoutChatOpen) return;
			patchState({ unreadChatCount: 0 });
			updateChatBadge(app, 0);
		},
		onCustomBackgroundUpload: async (file) => handleCustomBackgroundUpload(app, file, navigate),
		onRemoveCustomBackground: (id) => handleRemoveCustomBackground(app, id, navigate),
		onDownloadFile: handleDownloadFile,
		getFileBlob: (fileId) => selectors.selectReceivedFileBlob(getState(), fileId) || null,
		onWindowMove: handleWindowMove,
		onWindowResize: handleWindowResize,
		getWindowPositions: () => selectors.selectWindowPositions(getState()),
		onToggleVideoLayout: () => handleToggleVideoLayout(app, navigate),
		onOpenStreamModal: (peerId) => handleOpenStreamModal(app, peerId),
		onShareOpen: () => {
			const modal = app.querySelector("#share-modal");
			const content = modal?.querySelector(".share-modal__content");
			if (!modal || !content) return;
			if (!modal.hasAttribute("hidden")) {
				minimizeShareModalToToolbar(app);
				return;
			}
			modal.removeAttribute("hidden");
			void handleShareOpen(app, getJoinUrl);
			clearToolbarMinimizeMotion(content);
			runExpandFromToolbar(app, content, toolbarShareBtn);
		}
	};
}

function buildRoomViewConfigChat(getHandlers) {
	const h = () => getHandlers();
	return {
		onSend: () => sendChatMessage(h()),
		onGiphyOpen: async () => {
			/* Config kommt vom Server (runtime-config endpoint) — daher async.
			 * Nur der Hinweis wartet darauf; das Suchfeld ist sofort bedienbar. */
			if (!(await hasGiphyKey())) {
				h().setGiphyHint?.(t("giphyNoKey"));
				h().setGiphyResults?.([]);
				return;
			}
			h().setGiphyHint?.("");
			h().setGiphyResults?.(await getTrendingGifs());
		},
		onGiphySearch: async (q) => {
			/* searchGifs selbst prüft den Key und liefert [] wenn keiner da ist. */
			h().setGiphyResults?.(await searchGifs(q));
		},
		onGiphySelect: (url, previewUrl) => {
			const g = h()._pendingGifs ?? [];
			g.push({ url, previewUrl: previewUrl || url });
			h()._pendingGifs = g;
			h().setGiphyPreview?.(g);
		},
		onRemoveGif: (index) => {
			const g = (h()._pendingGifs ?? []).filter((_, i) => i !== index);
			h()._pendingGifs = g;
			h().setGiphyPreview?.(g);
		}
	};
}

function buildRoomViewConfigPart2(app, deps) {
	const { handleStopScreen, setupAudioTrackEndedHandler, getStreamForViewers, applyEffectToPreview, navigate, setPeerVolume } = deps;

	const minimizeSettingsModalToToolbar = () => {
		const content = app.querySelector("#settings-modal:not([hidden]) .settings-modal__content");
		runMinimizeToToolbar(app, content, toolbarSettingsBtn, () => {
			app.querySelector("#settings-modal")?.setAttribute("hidden", "");
			void handleSettingsOpen(app, false, applyEffectToPreview, refreshDeviceSelects, navigate);
		});
	};

	const openSettingsModalFromToolbar = () => {
		const modal = app.querySelector("#settings-modal");
		const content = modal?.querySelector(".settings-modal__content");
		if (!modal || !content) return;
		modal.removeAttribute("hidden");
		void handleSettingsOpen(app, true, applyEffectToPreview, refreshDeviceSelects, navigate);
		clearToolbarMinimizeMotion(content);
		runExpandFromToolbar(app, content, toolbarSettingsBtn);
	};

	const onResetFreeLayout = () => {
		const wp = selectors.selectWindowPositions(getState());
		const next = {
			...wp,
			videos: { ...WINDOW_POSITION_DEFAULTS.videos },
			chat: { ...WINDOW_POSITION_DEFAULTS.chat },
			participants: { ...WINDOW_POSITION_DEFAULTS.participants }
		};
		patchState({ windowPositions: next });
		try {
			localStorage.setItem(WINDOW_POSITIONS_STORAGE, JSON.stringify(next));
		} catch (_) {}
		navigate("room-view");
	};

	return {
		onToggleMute: () => handleToggleMute(app, setupAudioTrackEndedHandler, navigate),
		onToggleVideo: () => handleToggleVideo(app, applyEffectToPreview, applyEffectToCallStream, navigate, setupAudioTrackEndedHandler),
		onSettingsOpen: (isOpen) => handleSettingsOpen(app, isOpen, applyEffectToPreview, refreshDeviceSelects, navigate),
		onOpenSettingsModal: openSettingsModalFromToolbar,
		onMinimizeStreamModal: () => {
			const content = app.querySelector("#stream-modal:not([hidden]) .stream-modal__content");
			runMinimizeToToolbar(app, content, toolbarScreenBtn, () => {
				app.querySelector("#stream-modal")?.setAttribute("hidden", "");
			});
		},
		onMinimizeShareModal: () => minimizeShareModalToToolbar(app),
		onOpenPollsPanel: () => openPollsPanelFromToolbar(app),
		onMinimizePollsModal: () => minimizePollsModalToToolbar(app),
		onMinimizeSettingsModal: () => minimizeSettingsModalToToolbar(),
		onResetFreeLayout: onResetFreeLayout,
		onInputDeviceChange: (deviceId) =>
			handleInputDeviceChange(app, deviceId, setupAudioTrackEndedHandler, refreshDeviceSelects, navigate, applyEffectToPreview),
		onVideoDeviceChange: (deviceId) => handleVideoDeviceChange(app, deviceId, refreshDeviceSelects, navigate, applyEffectToPreview),
		onPeerVolumeChange: (peerId, percent) => setPeerVolume(peerId, percent),
		onBackgroundEffectChange: (effect) => handleBackgroundEffectChange(app, effect, applyEffectToCallStream, applyEffectToPreview, navigate),
		onOutputDeviceChange: (deviceId) => handleOutputDeviceChange(deviceId),
		onFileSelect: (files) => handleFileSelect(app, files, navigate),
		onStartScreen: () => handleStartScreen(app, getStreamForViewers, handleStopScreen, navigate),
		onStopScreen: () => handleStopScreenToolbar(app, handleStopScreen),
		onStopScreenDirect: () => {
			handleStopScreen();
			app.querySelectorAll(".stream-modal").forEach((el) => el.setAttribute("hidden", ""));
		},
		onAudioScreenToggle: () => handleAudioScreenToggle(app, getStreamForViewers),
		onToggleHand: () => {
			const s = getState();
			const p = selectors.selectHostPeer(s) || selectors.selectViewerConn(s);
			if (!p?.sendWs) return;
			p.sendWs({ type: "hand_raise", raised: !selectors.selectMyHandRaised(s) });
		},
		onSendReaction: (emoji) => {
			if (!emoji) return;
			const s = getState();
			const myId = selectors.selectMyPeerId(s);
			if (myId && selectors.selectScreen(s) === "room-view") {
				spawnFloatingReaction(app, myId, emoji);
			}
			const p = selectors.selectHostPeer(s) || selectors.selectViewerConn(s);
			p?.sendWs?.({ type: "reaction", emoji });
		},
		onSendReactionEffect: (effect) => {
			if (!effect) return;
			const s = getState();
			const trimmed = String(effect).trim();
			if (selectors.selectScreen(s) === "room-view") {
				playReactionEffect(app, trimmed);
			}
			const p = selectors.selectHostPeer(s) || selectors.selectViewerConn(s);
			p?.sendWs?.({ type: "reaction_effect", effect: trimmed });
		},
		onPollVote: (pollId, optionIndex) => {
			const p = selectors.selectHostPeer(getState()) || selectors.selectViewerConn(getState());
			p?.sendWs?.({ type: "poll_vote", pollId, optionIndex });
		},
		onPollCreate: (question, options) => {
			if (!question?.trim() || !options || options.length < 2) return;
			if (options.length > POLL_CREATE_MAX_OPTIONS) return;
			const p = selectors.selectHostPeer(getState()) || selectors.selectViewerConn(getState());
			p?.sendWs?.({ type: "poll_create", question: question.trim(), options });
		},
		onPollClose: (pollId) => {
			if (!pollId) return;
			const p = selectors.selectHostPeer(getState()) || selectors.selectViewerConn(getState());
			p?.sendWs?.({ type: "poll_close", pollId });
		}
	};
}

/** Dedupe fallback hints: one per (requested → actual) pair. */
let lastDeviceFallbackKey = "";

function installDeviceFallbackNotifier() {
	lastDeviceFallbackKey = "";
	peer.setDeviceFallbackNotifier((info) => {
		const key = `${info.kind}|${info.requestedDeviceId}|${info.actualDeviceId}`;
		if (key === lastDeviceFallbackKey) return;
		lastDeviceFallbackKey = key;
		const name = info.actualLabel || t("defaultDevice");
		const msg = (info.kind === "video" ? t("cameraDeviceFallbackToast") : t("micDeviceFallbackToast")).replace("{device}", name);
		showToast(msg, { type: "warning", duration: 7000 });
	});
}

export function attachRoomViewAndHandlers(app, deps) {
	let handlers;
	const config = {
		...buildRoomViewConfigNav(app, deps),
		...buildRoomViewConfigChat(() => handlers),
		...buildRoomViewConfigPart2(app, deps),
		onAudioSettingsChange: (partial) => handleAudioSettingsChange(app, partial)
		,
		onBackgroundEffectsSettingsChange: (partial) =>
			handleBackgroundEffectsSettingsChange(app, partial, applyEffectToCallStream, applyEffectToPreview, navigate)
	};
	handlers = attachRoomViewListeners(app, config);
	setupDropzone(app.querySelector("#dropzone"), handlers.onFileSelect);
	setupDropzone(app.querySelector("#chat-dropzone"), handlers.onFileSelect);
	installDeviceFallbackNotifier();
	startMicSilenceWatchdog();
	runInitialRoomSetup(app, deps);
}

function doMuteLocalStream(s) {
	disposeMicNoiseGate();
	selectors
		.selectLocalStream(s)
		?.getAudioTracks?.()
		.forEach((t) => t.stop());
	selectors
		.selectBaseLocalStream(s)
		?.getAudioTracks?.()
		.forEach((t) => {
			if (t.readyState !== "ended") t.stop();
		});
	const lv = selectors.selectLocalStream(s)?.getVideoTracks?.()?.[0];
	const bv = selectors.selectBaseLocalStream(s)?.getVideoTracks?.()?.[0];
	const baseVideo = bv && lv && bv !== lv ? bv : lv;
	const localStream = new MediaStream(lv ? [lv] : []);
	const baseStream = new MediaStream(baseVideo ? [baseVideo] : []);
	patchState({ localStream, baseLocalStream: baseStream });
}

function reenableExistingAudio(s) {
	const tracks = selectors.selectLocalStream(s)?.getAudioTracks?.() ?? [];
	const hasActive = tracks.length > 0 && tracks[0]?.readyState !== "ended";
	if (hasActive) {
		selectors
			.selectLocalStream(s)
			.getAudioTracks()
			.forEach((tr) => {
				tr.enabled = true;
			});
		return true;
	}
	return false;
}

async function acquireNewAudioStream(s, setupAudioTrackEndedHandler) {
	const newStream = await peer.getUserMediaResilient(selectors.selectInputDeviceId(s) || undefined, false, undefined);
	const newAudioTrack = newStream.getAudioTracks?.()[0];
	if (!newAudioTrack) return false;
	newStream.getVideoTracks?.().forEach((t) => t.stop());
	const local = selectors.selectLocalStream(s);
	const base = selectors.selectBaseLocalStream(s);
	const lv = local?.getVideoTracks?.()?.[0];
	const bv = base?.getVideoTracks?.()?.[0];
	const baseVideo = bv && lv && bv !== lv ? bv : lv;
	const localStream = new MediaStream(lv ? [newAudioTrack, lv] : [newAudioTrack]);
	const baseStream = new MediaStream(baseVideo ? [newAudioTrack, baseVideo] : [newAudioTrack]);
	const inputDeviceId = newAudioTrack.getSettings?.()?.deviceId || selectors.selectInputDeviceId(s);
	patchState({ localStream: prepareRoomLocalStream(localStream), baseLocalStream: baseStream, inputDeviceId });
	if (inputDeviceId) writeDeviceId(DEVICE_STORAGE.input, inputDeviceId);
	setupAudioTrackEndedHandler(newAudioTrack);
	return true;
}

async function doUnmuteLocalStream(s, setupAudioTrackEndedHandler) {
	if (reenableExistingAudio(s)) return true;
	try {
		if (await acquireNewAudioStream(s, setupAudioTrackEndedHandler)) return true;
		return false;
	} catch (err) {
		console.error("microphone access failed:", err);
		alertMediaAccessError(err, "audio");
		patchState({ isMuted: true });
		return false;
	}
}

/**
 * @param {{ forceMicProducer?: boolean; skipCamProducerChanges?: boolean }} [options] After device/gate change: recreate mic producer (otherwise same Web Audio destination track → mediasoup sees “no change”). `skipCamProducerChanges`: only for device-recovery mute with active background.
 */
async function syncMuteToPeersAsync(app, options = {}) {
	const { forceMicProducer = false, skipCamProducerChanges = false } = options;
	const streamOpts =
		forceMicProducer || skipCamProducerChanges
			? {
					...(forceMicProducer ? { forceMicProducer: true } : {}),
					...(skipCamProducerChanges ? { skipCamProducerChanges: true } : {})
				}
			: undefined;
	const state = getState();
	let localStream = selectors.selectLocalStream(state);
	if (localStream?.getAudioTracks?.()?.some((t) => t && t.readyState === "live")) {
		localStream = prepareRoomLocalStream(localStream);
		patchState({ localStream });
	}
	const stAfter = getState();
	localStream = selectors.selectLocalStream(stAfter);
	const myPeerId = selectors.selectMyPeerId(stAfter);
	const host = selectors.selectHostPeer(stAfter);
	const viewer = selectors.selectViewerConn(stAfter);
	/* Single participant — parallel host+viewer would touch the same transport PC twice and mix queued updates with ended tracks. */
	const participant = host || viewer;
	if (participant?.updateLocalStream) await participant.updateLocalStream(localStream, streamOpts);
	if (host) host.broadcastMute?.(myPeerId, selectors.selectIsMuted(stAfter));
	else viewer?.sendMute?.(selectors.selectIsMuted(stAfter));
	const nextMute = new Map(selectors.selectPeerMuteState(stAfter));
	nextMute.set(myPeerId, selectors.selectIsMuted(stAfter));
	patchState({ peerMuteState: nextMute });
	if (myPeerId) attachRemoteAudio(myPeerId, localStream, app);
	updateVoipParticipants(
		app,
		selectors.selectVoipMembers(stAfter),
		myPeerId,
		selectors.selectIsMuted(stAfter),
		selectors.selectScreenStreams(stAfter),
		getStreamForPeerId,
		getStreamForScreenShare,
		selectors.selectPeerMuteState(stAfter),
		selectors.selectPeerVolume(stAfter),
		selectors.selectBackgroundEffect(stAfter),
		selectors.selectPeerVideoState(stAfter),
		selectors.selectIsVideoEnabled(stAfter),
		selectors.selectPeerBackgroundEffect(stAfter)
	);
	updateMuteButton(app, selectors.selectIsMuted(stAfter));
}

function syncMuteToPeers(app) {
	syncMuteToPeersAsync(app).catch((e) => console.warn("[easymeet] syncMuteToPeers:", e?.message || e));
}

/**
 * Stay muted: bind new mic like unmute, but all audio tracks disabled + sync (do not flip isMuted).
 */
export async function rebindMicWhileMutedForDeviceRecovery(app, setupAudioTrackEndedHandler) {
	const s0 = getState();
	if (!selectors.selectIsMuted(s0)) return;
	mediaDebugLog("device:recovery:rebind-mic-while-muted:start", {});
	try {
		if (!(await acquireNewAudioStream(s0, setupAudioTrackEndedHandler))) return;
		const st = getState();
		const muteAudios = (stream) =>
			stream?.getAudioTracks?.()?.forEach((t) => {
				if (t) t.enabled = false;
			});
		muteAudios(selectors.selectLocalStream(st));
		muteAudios(selectors.selectBaseLocalStream(st));
		await syncMuteToPeersAsync(app, { forceMicProducer: true });
		mediaDebugLog("device:recovery:rebind-mic-while-muted:done", {});
	} catch (e) {
		console.warn("[easymeet] rebind mic while muted (device recovery):", e?.message || e);
	}
}

/**
 * Same path as user: mute → unmute (local + mediasoup + VoIP UI).
 * Only call when the user is **not** muted (otherwise use `rebindMicWhileMutedForDeviceRecovery`).
 */
export async function replayMuteUnmuteForDeviceRecovery(app, setupAudioTrackEndedHandler) {
	const s0 = getState();
	if (selectors.selectIsMuted(s0)) return;

	mediaDebugLog("device:recovery:mute-unmute-cycle:start", {});

	patchState({ isMuted: true });
	doMuteLocalStream(getState());
	const stAfterMute = getState();
	const recoverySkipCam =
		(selectors.selectBackgroundEffect(stAfterMute) || "none") !== "none" &&
		selectors.selectIsVideoEnabled(stAfterMute);
	await syncMuteToPeersAsync(
		app,
		recoverySkipCam ? { skipCamProducerChanges: true } : {}
	);

	patchState({ isMuted: false });
	const s1 = getState();
	if (!(await doUnmuteLocalStream(s1, setupAudioTrackEndedHandler))) {
		patchState({ isMuted: true });
		await syncMuteToPeersAsync(
			app,
			recoverySkipCam ? { skipCamProducerChanges: true } : {}
		);
		return;
	}
	/* Brief wait: gate/destination track should be live before produce (otherwise “track ended” in logs). */
	await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
	await syncMuteToPeersAsync(app, { forceMicProducer: true });
	mediaDebugLog("device:recovery:mute-unmute-cycle:done", {});
}

async function handleToggleMute(app, setupAudioTrackEndedHandler, navigate) {
	const s = getState();
	const willBeMuted = !selectors.selectIsMuted(s);
	patchState({ isMuted: willBeMuted });
	if (willBeMuted) doMuteLocalStream(s);
	else if (!(await doUnmuteLocalStream(s, setupAudioTrackEndedHandler))) return;
	await syncMuteToPeersAsync(app);
}

function turnOffVideoStream(s) {
	if (s.backgroundEffectStop) {
		try {
			s.backgroundEffectStop();
		} catch (_) {}
		patchState({ backgroundEffectStop: null });
	}
	selectors
		.selectLocalStream(s)
		?.getVideoTracks?.()
		.forEach((t) => t.stop());
	selectors
		.selectBaseLocalStream(s)
		?.getVideoTracks?.()
		.forEach((t) => {
			if (t.readyState !== "ended") t.stop();
		});
	const audioTrack = selectors.selectLocalStream(s)?.getAudioTracks?.()[0];
	const newStream = audioTrack ? new MediaStream([audioTrack]) : new MediaStream();
	if (audioTrack)
		newStream.getAudioTracks().forEach((t) => {
			t.enabled = !selectors.selectIsMuted(s);
		});
	const forRoom = audioTrack ? prepareRoomLocalStream(newStream) : newStream;
	patchState({ localStream: forRoom, baseLocalStream: newStream });
}

async function setupPreviewWhenVideoOff(app, s, applyEffectToPreview) {
	const previewVideo = app.querySelector("#effect-preview-video");
	const settingsModal = app.querySelector("#settings-modal");
	if (!previewVideo || !settingsModal || settingsModal.hasAttribute("hidden") || !selectors.selectHasVideoSupport(s)) return;
	try {
		try {
			selectors.selectPreviewEffectStop(getState())?.();
		} catch (_) {}
		patchState({ _previewEffectStop: null });
		const prevStream = selectors.selectPreviewStream(getState());
		if (prevStream) prevStream.getTracks().forEach((t) => t.stop());
		const previewStream = await peer.getUserMedia(undefined, "videoOnly", selectors.selectVideoDeviceId(s) || undefined);
		patchState({ _previewStream: previewStream });
		await applyEffectToPreview(previewStream, selectors.selectBackgroundEffect(s) || "none", previewVideo);
	} catch (err) {
		console.warn("preview stream failed:", err);
		previewVideo.srcObject = null;
	}
}

function reenableExistingVideo(s) {
	const tracks = selectors.selectLocalStream(s)?.getVideoTracks?.() ?? [];
	const hasActive = tracks.length > 0 && tracks[0]?.readyState !== "ended";
	if (hasActive) {
		selectors
			.selectLocalStream(s)
			.getVideoTracks()
			.forEach((tr) => {
				tr.enabled = true;
			});
		patchState({ isVideoEnabled: true });
		return true;
	}
	return false;
}

async function acquireNewVideoStream(s, setupAudioTrackEndedHandler) {
	const wantMic = !selectors.selectIsMuted(s);
	const existingAudio = selectors.selectLocalStream(s)?.getAudioTracks?.()?.[0];
	const existingAudioOk = existingAudio && existingAudio.readyState !== "ended";
	const requestBoth = existingAudioOk || wantMic;
	let newStream;
	try {
		newStream = await peer.getUserMediaResilient(
			selectors.selectInputDeviceId(s) || undefined,
			requestBoth ? true : "videoOnly",
			selectors.selectVideoDeviceId(s) || undefined
		);
	} catch {
		newStream = await peer.getUserMedia(null, requestBoth ? true : "videoOnly", null);
	}
	const videoTrack = newStream.getVideoTracks?.()[0];
	if (!videoTrack) return false;
	const audioTrackToUse = existingAudioOk ? existingAudio : wantMic ? newStream.getAudioTracks?.()?.[0] : undefined;
	const tracks = [];
	if (audioTrackToUse) tracks.push(audioTrackToUse);
	tracks.push(videoTrack);
	const localStream = new MediaStream(tracks);
	localStream.getAudioTracks().forEach((t) => {
		t.enabled = !selectors.selectIsMuted(s);
	});
	newStream.getAudioTracks().forEach((t) => {
		if (t !== audioTrackToUse) t.stop();
	});
	newStream.getVideoTracks().forEach((t) => {
		if (t !== videoTrack) t.stop();
	});
	if (audioTrackToUse && audioTrackToUse.readyState !== "ended" && typeof setupAudioTrackEndedHandler === "function") {
		setupAudioTrackEndedHandler(audioTrackToUse);
	}
	const videoDeviceId = videoTrack.getSettings?.()?.deviceId || selectors.selectVideoDeviceId(s);
	patchState({
		localStream: prepareRoomLocalStream(localStream),
		baseLocalStream: localStream,
		hasVideoSupport: true,
		videoDeviceId,
		isVideoEnabled: true
	});
	if (videoDeviceId) writeDeviceId(DEVICE_STORAGE.video, videoDeviceId);
	return true;
}

async function turnOnVideoStream(s, setupAudioTrackEndedHandler) {
	if (reenableExistingVideo(s)) return true;
	try {
		return await acquireNewVideoStream(s, setupAudioTrackEndedHandler);
	} catch (err) {
		console.error("camera access failed:", err);
		alertMediaAccessError(err, "video");
		return false;
	}
}

function cleanupPreviewWhenVideoOn(app) {
	const state = getState();
	const previewVideo = app.querySelector("#effect-preview-video");
	const settingsModal = app.querySelector("#settings-modal");
	if (
		!previewVideo ||
		!settingsModal ||
		settingsModal.hasAttribute("hidden") ||
		!selectors.selectIsVideoEnabled(state) ||
		!selectors.selectLocalStream(state)?.getVideoTracks?.().length
	)
		return;
	const prevStream = selectors.selectPreviewStream(getState());
	if (prevStream) {
		prevStream.getTracks().forEach((t) => t.stop());
		patchState({ _previewStream: null });
	}
	try {
		selectors.selectPreviewEffectStop(getState())?.();
	} catch (_) {}
	patchState({ _previewEffectStop: null });
}

function syncVideoToPeers(app) {
	const state = getState();
	const localStream = selectors.selectLocalStream(state);
	const myPeerId = selectors.selectMyPeerId(state);
	selectors.selectHostPeer(state)?.updateLocalStream?.(localStream);
	selectors.selectViewerConn(state)?.updateLocalStream?.(localStream);
	updateVideoButton(app, selectors.selectIsVideoEnabled(state));
	if (myPeerId) {
		attachRemoteAudio(myPeerId, localStream, app);
		if (selectors.selectHostPeer(state)) selectors.selectHostPeer(state).broadcastVideo?.(myPeerId, selectors.selectIsVideoEnabled(state));
		else selectors.selectViewerConn(state)?.sendVideo?.(selectors.selectIsVideoEnabled(state));
		if (selectors.selectScreen(state) === "room-view") {
			updateVoipParticipants(
				app,
				selectors.selectVoipMembers(state),
				myPeerId,
				selectors.selectIsMuted(state),
				selectors.selectScreenStreams(state),
				getStreamForPeerId,
				getStreamForScreenShare,
				selectors.selectPeerMuteState(state),
				selectors.selectPeerVolume(state),
				selectors.selectBackgroundEffect(state),
				selectors.selectPeerVideoState(state),
				selectors.selectIsVideoEnabled(state),
				selectors.selectPeerBackgroundEffect(state)
			);
		}
	}
}

async function applyEffectAfterVideoToggle(app, applyEffectToCallStream, navigate) {
	if (!selectors.selectLocalStream(getState())?.getVideoTracks?.()?.length) return;
	const eff = selectors.selectBackgroundEffect(getState()) ?? "none";
	await applyEffectToCallStream(eff, app, attachRemoteAudio, updateVoipParticipants, updateEffectTilesSelection, getStreamForPeerId, getStreamForScreenShare, navigate);
}

function syncPreviewVideoIfSettingsOpen(app) {
	const preview = app.querySelector("#effect-preview-video");
	const modal = app.querySelector("#settings-modal");
	if (preview && modal && !modal.hasAttribute("hidden") && selectors.selectIsVideoEnabled(getState())) {
		preview.srcObject = selectors.selectLocalStream(getState());
	}
}

async function handleToggleVideo(app, applyEffectToPreview, applyEffectToCallStream, navigate, setupAudioTrackEndedHandler) {
	if (selectors.selectVideoLayoutMode(getState()) === "free" && !getState().freeLayoutVideosOpen) {
		openFreeLayoutVideosPanel(app);
		return;
	}
	const s = getState();
	if (selectors.selectIsVideoEnabled(s)) {
		patchState({ isVideoEnabled: false });
		turnOffVideoStream(s);
		await setupPreviewWhenVideoOff(app, s, applyEffectToPreview);
	} else if (!(await turnOnVideoStream(s, setupAudioTrackEndedHandler))) return;
	cleanupPreviewWhenVideoOn(app);
	syncVideoToPeers(app);
	await applyEffectAfterVideoToggle(app, applyEffectToCallStream, navigate);
	syncPreviewVideoIfSettingsOpen(app);
}

function stopPreviewStreams() {
	try {
		selectors.selectPreviewEffectStop(getState())?.();
	} catch (_) {}
	patchState({ _previewEffectStop: null });
	const prevStream = selectors.selectPreviewStream(getState());
	if (prevStream) {
		prevStream.getTracks().forEach((t) => t.stop());
		patchState({ _previewStream: null });
	}
}

function cleanupPreviewVideo(previewVideo) {
	stopPreviewStreams();
	previewVideo.srcObject = null;
}

function showLocalStreamInPreview(previewVideo, st) {
	if (selectors.selectIsVideoEnabled(st) && selectors.selectLocalStream(st)?.getVideoTracks?.().length) {
		/* Dedicated preview camera (_previewStream) must not linger: otherwise handleBackgroundEffectChange
		 * wrongly takes the preview-only path while the UI already shows the call's localStream. */
		stopPreviewStreams();
		previewVideo.srcObject = selectors.selectLocalStream(st);
		previewVideo.play?.().catch(() => {});
		return true;
	}
	return false;
}

async function showEffectPreviewInSettings(app, applyEffectToPreview, previewVideo) {
	stopPreviewStreams();
	const previewStream = await peer.getUserMedia(undefined, "videoOnly", selectors.selectVideoDeviceId(getState()) || undefined);
	patchState({ _previewStream: previewStream });
	await applyEffectToPreview(previewStream, selectors.selectBackgroundEffect(getState()) || "none", previewVideo);
	previewVideo.play?.().catch(() => {});
}

async function setupPreviewVideoWhenOpen(app, applyEffectToPreview) {
	await new Promise((r) => requestAnimationFrame(r));
	const st = getState();
	const settingsModal = app.querySelector("#settings-modal");
	if (!selectors.selectSettingsPanelOpen(st) || !settingsModal || settingsModal.hasAttribute("hidden")) return;
	const previewVideo = app.querySelector("#effect-preview-video");
	if (!previewVideo) return;
	if (!showLocalStreamInPreview(previewVideo, st)) {
		try {
			await showEffectPreviewInSettings(app, applyEffectToPreview, previewVideo);
		} catch (err) {
			console.warn("preview stream failed:", err);
			previewVideo.srcObject = null;
		}
	}
}

/** After device hotplug (preview was stopped so the call could take the camera). */
export async function restartEffectPreviewAfterDeviceRecovery(app, applyEffectToPreview) {
	await new Promise((r) => requestAnimationFrame(r));
	const st = getState();
	const modal = app.querySelector("#settings-modal");
	if (!selectors.selectSettingsPanelOpen(st) || !modal || modal.hasAttribute("hidden")) return;
	await setupPreviewVideoWhenOpen(app, applyEffectToPreview);
}

async function handleSettingsOpen(app, isOpen, applyEffectToPreview, refreshDeviceSelects, navigate) {
	const legacyDevHandler = selectors.selectDeviceChangeHandler(getState());
	if (legacyDevHandler) {
		navigator.mediaDevices?.removeEventListener?.("devicechange", legacyDevHandler);
		patchState({ _deviceChangeHandler: null });
	}
	patchState({ settingsPanelOpen: isOpen });
	await refreshDeviceSelects(app);
	const previewVideo = app.querySelector("#effect-preview-video");
	if (previewVideo) {
		if (!isOpen) cleanupPreviewVideo(previewVideo);
		else await setupPreviewVideoWhenOpen(app, applyEffectToPreview);
	}
}

function stopEffectAndAcquireStream(s, deviceId) {
	try {
		s.backgroundEffectStop?.();
	} catch (_) {}
	patchState({ backgroundEffectStop: null });
	const wantVideo = Boolean(selectors.selectIsVideoEnabled(s) && (selectors.selectHasVideoSupport(s) ?? false));
	return peer.getUserMediaResilient(deviceId || undefined, wantVideo, selectors.selectVideoDeviceId(s) || undefined);
}

function buildLocalStreamFromTracks(audioTrack, videoTrack, s) {
	const tracks = [audioTrack];
	if (videoTrack) {
		videoTrack.enabled = selectors.selectIsVideoEnabled(getState()) ?? false;
		tracks.push(videoTrack);
	}
	const localStream = new MediaStream(tracks);
	localStream.getAudioTracks().forEach((t) => {
		t.enabled = !selectors.selectIsMuted(getState());
	});
	return localStream;
}

function syncPreviewVideoToLocalStream(app, localStream) {
	const preview = app.querySelector("#effect-preview-video");
	const modal = app.querySelector("#settings-modal");
	if (preview && modal && !modal.hasAttribute("hidden") && selectors.selectIsVideoEnabled(getState()) && localStream?.getVideoTracks?.().length) {
		preview.srcObject = null;
		preview.srcObject = selectors.selectLocalStream(getState());
		preview.play?.().catch(() => {});
	}
}

async function syncPeersAndSpeakingAfterInputChange(app, localStream, inputDeviceId, videoDeviceId, setupAudioTrackEndedHandler) {
	if (inputDeviceId) writeDeviceId(DEVICE_STORAGE.input, inputDeviceId);
	else localStorage.removeItem(DEVICE_STORAGE.input);
	if (videoDeviceId) writeDeviceId(DEVICE_STORAGE.video, videoDeviceId);
	const gated = prepareRoomLocalStream(localStream);
	patchState({ localStream: gated });
	const rawMic = getMicGateRawInputTrack() || localStream.getAudioTracks?.()?.[0];
	if (rawMic) setupAudioTrackEndedHandler(rawMic);
	const st = getState();
	const out = selectors.selectLocalStream(st);
	const participant = selectors.selectHostPeer(st) || selectors.selectViewerConn(st);
	try {
		await participant?.updateLocalStream?.(out, { forceMicProducer: true });
	} catch (e) {
		console.warn("[easymeet] updateLocalStream after input device change:", e?.message || e);
	}
	const myPeerId = selectors.selectMyPeerId(st);
	if (myPeerId) {
		attachRemoteAudio(myPeerId, out, app);
		if (selectors.selectScreen(st) === "room-view") {
			stopSpeakingIndicator(myPeerId);
			startSpeakingIndicator(myPeerId, out, app);
		}
	}
	if (selectors.selectScreen(st) === "room-view") updateVideoButton(app, selectors.selectIsVideoEnabled(st));
}

async function applyPreviousEffectAfterDeviceChange(app, previousEffect, navigate) {
	const eff = previousEffect && previousEffect !== "none" ? previousEffect : "none";
	if (eff === "none") {
		patchState({ backgroundEffect: "none" });
		updateEffectTilesSelection(app, "none");
	}
	await applyEffectToCallStream(eff, app, attachRemoteAudio, updateVoipParticipants, updateEffectTilesSelection, getStreamForPeerId, getStreamForScreenShare, navigate);
}

async function swapInputDeviceAndSync(app, s, deviceId, newStream, setupAudioTrackEndedHandler) {
	const audioTrack = newStream.getAudioTracks?.()[0];
	const videoTrack = newStream.getVideoTracks?.()[0];
	if (!audioTrack) {
		newStream.getTracks().forEach((t) => t.stop());
		return null;
	}
	const oldStream = selectors.selectLocalStream(getState());
	const localStream = buildLocalStreamFromTracks(audioTrack, videoTrack, s);
	patchState({ localStream, baseLocalStream: localStream });
	const inputDeviceId = deviceId || audioTrack.getSettings?.()?.deviceId || null;
	const videoDeviceId = videoTrack ? videoTrack.getSettings?.()?.deviceId || selectors.selectVideoDeviceId(getState()) : null;
	patchState({ inputDeviceId, videoDeviceId });
	syncPreviewVideoToLocalStream(app, localStream);
	await syncPeersAndSpeakingAfterInputChange(app, localStream, inputDeviceId, videoDeviceId, setupAudioTrackEndedHandler);
	/* Do not stop tracks still referenced by current local/base (e.g. noise-gate destination — would kill the mic path). */
	const keep = new Set();
	for (const stream of [selectors.selectLocalStream(getState()), selectors.selectBaseLocalStream(getState())]) {
		stream?.getTracks?.()?.forEach((t) => t && keep.add(t));
	}
	oldStream?.getTracks?.()?.forEach((t) => {
		if (!t || t.readyState === "ended" || keep.has(t)) return;
		try {
			t.stop();
		} catch (_) {}
	});
	return localStream;
}

async function handleInputDeviceChange(app, deviceId, setupAudioTrackEndedHandler, refreshDeviceSelects, navigate, applyEffectToPreview) {
	stopPreviewStreams();
	const s = getState();
	if (!selectors.selectLocalStream(s)) return;
	try {
		const previousEffect = selectors.selectBackgroundEffect(s);
		const newStream = await stopEffectAndAcquireStream(s, deviceId);
		if (!(await swapInputDeviceAndSync(app, s, deviceId, newStream, setupAudioTrackEndedHandler))) return;
		refreshDeviceSelects(app);
		await applyPreviousEffectAfterDeviceChange(app, previousEffect, navigate);
		/* After effect pipeline: re-sync mute + mediasoup (producers/peers) */
		syncMuteToPeers(app);
		await refreshDeviceSelects(app);
		if (selectors.selectSettingsPanelOpen(getState())) await setupPreviewVideoWhenOpen(app, applyEffectToPreview);
	} catch (err) {
		console.error("microphone switch failed:", err);
		await refreshDeviceSelects(app);
	}
}

function persistVideoDeviceId(deviceId) {
	patchState({ videoDeviceId: deviceId || null });
	if (deviceId) writeDeviceId(DEVICE_STORAGE.video, deviceId);
	else localStorage.removeItem(DEVICE_STORAGE.video);
}

function buildLocalStreamWithNewVideo(s, newVideoTrack, audioTrack) {
	newVideoTrack.enabled = selectors.selectIsVideoEnabled(s) ?? false;
	const tracks = audioTrack ? [audioTrack, newVideoTrack] : [newVideoTrack];
	const localStream = new MediaStream(tracks);
	localStream?.getAudioTracks?.().forEach((t) => {
		t.enabled = !selectors.selectIsMuted(s);
	});
	return localStream;
}

function syncPeersAndPreviewAfterVideoChange(app, localStream, deviceId) {
	const vdId = selectors.selectVideoDeviceId(getState());
	if (vdId) writeDeviceId(DEVICE_STORAGE.video, vdId);
	else localStorage.removeItem(DEVICE_STORAGE.video);
	/* Producer updates only via applyEffectToCallStream (await) — otherwise races _updateLock / duplicate path. */
	const myPeerId = selectors.selectMyPeerId(getState());
	if (myPeerId) attachRemoteAudio(myPeerId, localStream, app);
	const preview = app.querySelector("#effect-preview-video");
	const modal = app.querySelector("#settings-modal");
	if (preview && modal && !modal.hasAttribute("hidden") && localStream) {
		preview.srcObject = localStream;
	}
	if (selectors.selectScreen(getState()) === "room-view") updateVideoButton(app, selectors.selectIsVideoEnabled(getState()));
}

function swapVideoDeviceAndSync(app, s, deviceId, newStream) {
	const newVideoTrack = newStream.getVideoTracks?.()[0];
	if (!newVideoTrack) return false;
	const audioTrack = selectors.selectLocalStream(s)?.getAudioTracks?.()[0];
	const built = buildLocalStreamWithNewVideo(s, newVideoTrack, audioTrack);
	const gated = prepareRoomLocalStream(built);
	patchState({
		localStream: gated,
		baseLocalStream: built,
		videoDeviceId: newVideoTrack.getSettings?.()?.deviceId || deviceId || null
	});
	selectors
		.selectLocalStream(s)
		.getVideoTracks()
		.forEach((t) => t.stop());
	newStream.getAudioTracks().forEach((t) => t.stop());
	syncPeersAndPreviewAfterVideoChange(app, selectors.selectLocalStream(getState()), deviceId);
	return true;
}

async function handleVideoDeviceChange(app, deviceId, refreshDeviceSelects, navigate, applyEffectToPreview) {
	stopPreviewStreams();
	persistVideoDeviceId(deviceId);
	const s = getState();
	if (!selectors.selectLocalStream(s) || !selectors.selectHasVideoSupport(s)) return;
	try {
		const previousEffect = selectors.selectBackgroundEffect(s);
		try {
			s.backgroundEffectStop?.();
		} catch (_) {}
		patchState({ backgroundEffectStop: null });
		const wantVideo = Boolean(selectors.selectIsVideoEnabled(s) && (selectors.selectHasVideoSupport(s) ?? false));
		const newStream = await peer.getUserMediaResilient(
			selectors.selectInputDeviceId(s) || undefined,
			wantVideo ? true : "videoOnly",
			deviceId || undefined
		);
		if (!swapVideoDeviceAndSync(app, s, deviceId, newStream)) return;
		await applyPreviousEffectAfterDeviceChange(app, previousEffect, navigate);
		syncMuteToPeers(app);
		await refreshDeviceSelects(app);
		if (selectors.selectSettingsPanelOpen(getState())) await setupPreviewVideoWhenOpen(app, applyEffectToPreview);
	} catch (err) {
		console.error("camera switch failed:", err);
		await refreshDeviceSelects(app);
	}
}

async function applyEffectToPreviewOnly(app, s, effect, applyEffectToPreview) {
	const previewVideo = app.querySelector("#effect-preview-video");
	const settingsModal = app.querySelector("#settings-modal");
	if (previewVideo && settingsModal && !settingsModal.hasAttribute("hidden")) {
		await applyEffectToPreview(s._previewStream, effect || "none", previewVideo);
	}
	updateEffectTilesSelection(app, effect || "none");
}

async function handleBackgroundEffectChange(app, effect, applyEffectToCallStream, applyEffectToPreview, navigate) {
	const s = getState();
	const next = effect || "none";
	const current = selectors.selectBackgroundEffect(s) || "none";
	mediaDebugLog("ui:bg-effect:handler", {
		next,
		current,
		videoEnabled: selectors.selectIsVideoEnabled(s),
		local: mediaDebugStreamInfo(selectors.selectLocalStream(s)),
		previewStream: Boolean(s._previewStream)
	});
	/* Same effect again: would run applyEffectToCallStream stop()+rebuild → both cameras black. */
	if (next === current) {
		mediaDebugLog("ui:bg-effect:skip-same", { effect: next });
		return;
	}

	let videoTrack = selectors.selectLocalStream(s)?.getVideoTracks?.()?.[0];
	/* Only readyState/live — not videoTrack.enabled: generator/canvas tracks can be briefly or
	 * wrongly disabled while camera is "on"; then only settings preview would update. */
	const hasLiveCallVideo = selectors.selectIsVideoEnabled(s) && videoTrack && videoTrack.readyState !== "ended";
	patchState({ backgroundEffect: next });
	if (!hasLiveCallVideo && s._previewStream) {
		mediaDebugLog("ui:bg-effect:path", { branch: "preview-only", hasLiveCallVideo, firstVideo: mediaDebugTrackInfo(videoTrack) });
		await applyEffectToPreviewOnly(app, s, next, applyEffectToPreview);
		return;
	}
	if (!videoTrack) {
		if (selectors.selectIsVideoEnabled(getState())) {
			mediaDebugLog("ui:bg-effect:try-recover-camera", {});
			await recoverCameraAfterEffectLoss(app, attachRemoteAudio);
			videoTrack = selectors.selectLocalStream(getState())?.getVideoTracks?.()?.[0];
		}
		if (!videoTrack) {
			mediaDebugLog("ui:bg-effect:path", { branch: "no-video-track-tiles-only" });
			updateEffectTilesSelection(app, next);
			return;
		}
	}
	mediaDebugLog("ui:bg-effect:path", { branch: "apply-to-call-stream" });
	await applyEffectToCallStream(next, app, attachRemoteAudio, updateVoipParticipants, updateEffectTilesSelection, getStreamForPeerId, getStreamForScreenShare, navigate);
	mediaDebugLog("ui:bg-effect:apply-done", { next });
}

function handleOutputDeviceChange(deviceId) {
	const outputDeviceId = deviceId || null;
	patchState({ outputDeviceId });
	if (outputDeviceId) writeDeviceId(DEVICE_STORAGE.output, outputDeviceId);
	else writeDeviceId(DEVICE_STORAGE.output, null);
	applyOutputDeviceToAllAudios(outputDeviceId);
}

async function prepareFileList(files, progressArea, showProgress) {
	let fileList = Array.from(files);
	if (files[0]?.webkitRelativePath) {
		showProgress(`<p class="file-progress__filename">${t("preparingZip")}</p><div class="em-brand-spinner em-brand-spinner--sm" aria-hidden="true"></div>`);
		const zipFile = await zipFileList(files);
		if (zipFile) fileList = [zipFile];
	}
	return fileList;
}

function createProgressUpdater(progressArea, fileName) {
	const transferProgress = { bytes: 0, total: 0 };
	return (progress) => {
		if (progress) {
			transferProgress.bytes = progress.bytesSent ?? progress.bytes;
			transferProgress.total = progress.total;
		}
		if (progressArea) {
			progressArea.hidden = false;
			const pct = transferProgress.total > 0 ? Math.min(100, (transferProgress.bytes / transferProgress.total) * 100) : 0;
			progressArea.innerHTML = `<p class="file-progress__filename">${escapeHtml(fileName)}</p><div class="file-progress__bar-wrap"><div class="file-progress__bar" style="--bar-width-pct:${pct}%"></div></div><p class="file-progress__stats">${t("sendingFile")}…</p>`;
		}
	};
}

async function sendSingleFile(app, file, hostPeer, viewerConn, nick, progressArea) {
	const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const ts = Date.now();
	const participant = hostPeer || viewerConn;
	if (participant?.broadcastFileShare) participant.broadcastFileShare(nick, file.name, ts, fileId, file.type || "");
	else if (participant?.sendFileShare) participant.sendFileShare(fileId, file.name, ts, file.type || "");
	const updateProgress = createProgressUpdater(progressArea, file.name);
	updateProgress();
	if (participant?.sendFileToRoom) {
		try {
			await participant.sendFileToRoom(file, updateProgress, nick, fileId);
			const blob = new Blob([await file.arrayBuffer()], { type: file.type || "application/octet-stream" });
			const blobs = new Map(selectors.selectReceivedFileBlobs(getState()));
			blobs.set(fileId, { blob, filename: file.name, mimeType: file.type || "application/octet-stream" });
			patchState({ receivedFileBlobs: blobs });
			if (selectors.selectScreen(getState()) === "room-view") updateFileShareMessage(app, fileId, file.name, nick);
		} catch (_) {}
	}
	if (progressArea) progressArea.hidden = true;
}

async function handleFileSelect(app, files, navigate) {
	if (!files?.length) return;
	const progressArea = app.querySelector("#file-progress-area");
	const showProgress = (html) => {
		if (progressArea) {
			progressArea.hidden = false;
			progressArea.innerHTML = html;
		}
	};
	const fileList = await prepareFileList(files, progressArea, showProgress);
	const hostPeer = selectors.selectHostPeer(getState());
	const viewerConn = selectors.selectViewerConn(getState());
	const participant = hostPeer || viewerConn;
	if (!participant?.sendFileToRoom) return;
	const nick = selectors.selectNickname(getState()) ?? "?";
	for (const file of fileList) {
		await sendSingleFile(app, file, hostPeer, viewerConn, nick, progressArea);
	}
}

function setupHostScreenShare(s, stream, getStreamForViewers, myPeerId, nick) {
	const screenStreams = new Map(selectors.selectScreenStreams(s));
	screenStreams.set(myPeerId ?? "", { stream, nick });
	patchState({ screenStreams });
	selectors.selectHostPeer(s).setScreenStream(getStreamForViewers());
	selectors.selectHostPeer(s).broadcastScreenSharing?.(myPeerId ?? "", nick);
}

function setupViewerScreenShare(s, stream, handleStopScreen, myPeerId, nick) {
	const screenStreams = new Map(selectors.selectScreenStreams(s));
	screenStreams.set(myPeerId ?? "", { stream, nick });
	patchState({ screenStreams });
	const participant = selectors.selectHostPeer(s) || selectors.selectViewerConn(s);
	if (participant?.setScreenStream) {
		participant.setScreenStream(stream);
		participant.broadcastScreenSharing?.(myPeerId ?? "", nick);
	}
}

async function handleStartScreen(app, getStreamForViewers, handleStopScreen, navigate) {
	try {
		const stream = await peer.getScreenStream();
		const hasAudio = stream.getAudioTracks().length > 0;
		patchState({ hostStream: stream, hasAudio, audioEnabled: hasAudio });
		stream.getVideoTracks()[0]?.addEventListener("ended", () => handleStopScreen());
		const s = getState();
		const myPeerId = selectors.selectMyPeerId(s);
		const nick = selectors.selectNickname(s) ?? "?";
		if (selectors.selectIsHost(s)) setupHostScreenShare(s, stream, getStreamForViewers, myPeerId, nick);
		else setupViewerScreenShare(s, stream, handleStopScreen, myPeerId, nick);
		const preview = app.querySelector("#host-preview");
		if (preview) preview.srcObject = stream;
		patchMeetingScreenSharePresentation(app);
	} catch (err) {
		alert(err.message || t("screenShareFailed"));
	}
}

function handleAudioScreenToggle(app, getStreamForViewers) {
	const s = getState();
	if (!selectors.selectHasAudio(s)) return;
	patchState({ audioEnabled: !selectors.selectAudioEnabled(s) });
	const participant = selectors.selectHostPeer(s) || selectors.selectViewerConn(s);
	participant?.setScreenStream?.(getStreamForViewers());
	patchMeetingScreenSharePresentation(app);
}
