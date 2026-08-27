/**
 * Effect: UI orchestration for Video Gallery layout and attaching Media objects
 * (DOM Side-Effects - Layer 4)
 */

import { getState, patchState } from "../../store/index.js";
import {
	selectMyPeerId,
	selectOutputDeviceId,
	selectVideoTilePositions,
	selectRemoteStreams,
	selectLocalStream,
	selectScreenStreams,
	selectVoipMembers
} from "../../domain/selectors/index.js";
import { startSpeakingIndicator, stopSpeakingIndicator } from "../../speaking-indicator.js";
import { getTileState, createNewTile, updateExistingTile, applyStreamToMedia, syncHandRaisedOnStatusRow } from "./tilesHelpers.js";
import { mediaDebugWireStreamVideoTracks, mediaDebugLog, mediaDebugStreamInfo } from "../../utils/mediaDebug.js";
import { applySharedAudioContextSink } from "../audio/audioContext.js";

const TILE_WIDTH = 280;
const TILE_HEIGHT = 210;
const TILE_GAP = 20;

export function getDefaultTilePosition(peerId, index) {
	const state = getState();
	const positions = selectVideoTilePositions(state);
	if (positions[peerId]) return positions[peerId];
	const col = index % 3;
	const row = Math.floor(index / 3);
	return { x: TILE_GAP + col * (TILE_WIDTH + TILE_GAP), y: TILE_GAP + row * (TILE_HEIGHT + TILE_GAP) };
}

export function setupFreeLayoutTile(tile, peerId, index) {
	if (tile.dataset.dragSetup === "true") return;
	tile.dataset.dragSetup = "true";
	const gallery = tile.closest("#video-gallery");
	if (!gallery || gallery.dataset.layoutMode !== "free") return;
	const pos = getDefaultTilePosition(peerId, index);
	tile.style.left = `${pos.x}px`;
	tile.style.top = `${pos.y}px`;

	const nameEl = tile.querySelector(".video-tile__name");
	if (!nameEl) return;
	let startX = 0,
		startY = 0,
		startLeft = 0,
		startTop = 0;

	const onMouseMove = (e) => {
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		const galleryRect = gallery.getBoundingClientRect();
		let left = Math.max(0, Math.min(galleryRect.width - TILE_WIDTH, startLeft + dx));
		let top = Math.max(0, Math.min(galleryRect.height - TILE_HEIGHT, startTop + dy));
		tile.style.left = `${left}px`;
		tile.style.top = `${top}px`;
		startX = e.clientX;
		startY = e.clientY;
		startLeft = left;
		startTop = top;
		const state = getState();
		const positions = { ...selectVideoTilePositions(state), [peerId]: { x: left, y: top } };
		patchState({ videoTilePositions: positions });
	};

	const onMouseUp = () => {
		document.removeEventListener("mousemove", onMouseMove);
		document.removeEventListener("mouseup", onMouseUp);
	};

	const onMouseDown = (e) => {
		e.preventDefault();
		const rect = tile.getBoundingClientRect();
		startX = e.clientX;
		startY = e.clientY;
		const gr = gallery.getBoundingClientRect();
		startLeft = rect.left - gr.left;
		startTop = rect.top - gr.top;
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	};

	nameEl.addEventListener("mousedown", onMouseDown);
}

export function updateVideoGalleryColumns() {
	const gallery = document.getElementById("video-gallery");
	if (!gallery) return;
	if (gallery.dataset.layoutMode === "free") return;
	const count = gallery.querySelectorAll(".video-tile").length;
	const cols = count <= 2 ? 1 : count <= 4 ? 2 : count <= 6 ? 3 : Math.min(4, Math.ceil(Math.sqrt(count)));
	gallery.dataset.count = String(count);
	gallery.style.setProperty("--video-cols", String(cols));
}

/** Synchronisiert Hand-heben-Anzeige auf Kacheln (ohne erneutes attachRemoteAudio). */
export function syncHandRaisedOnVideoTiles() {
	const gallery = document.getElementById("video-gallery");
	if (!gallery) return;
	const members = selectVoipMembers(getState());
	gallery.querySelectorAll(".video-tile").forEach((tile) => {
		const id = tile.dataset.peerId;
		const raised = !!members.find((m) => m.peerId === id)?.handRaised;
		const row = tile.querySelector(".video-tile__status-row");
		if (row) syncHandRaisedOnStatusRow(row, raised);
	});
}

/**
 * @param {HTMLElement} app
 * @param {{ forceTileMediaRefresh?: boolean }} [options] After hotplug: reattach local video element to stream (same MediaStream ref, new tracks).
 */
export function attachRemoteAudio(peerId, stream, app, options) {
	const forceTileMediaRefresh = Boolean(options?.forceTileMediaRefresh);
	const container = document.getElementById("video-gallery") || document.getElementById("remote-audio-container") || document.body;
	let tile = container.querySelector(`.video-tile[data-peer-id="${peerId}"]`);
	const state = getState();
	const tileState = getTileState(state, peerId, stream);

	let mediaEl;
	if (!tile) {
		const result = createNewTile(container, peerId, tileState);
		tile = result.tile;
		mediaEl = result.mediaEl;
		const idx = container.querySelectorAll(".video-tile").length - 1;
		setupFreeLayoutTile(tile, peerId, idx);
	} else {
		mediaEl = tile.querySelector("video");
		updateExistingTile(tile, peerId, tileState);
	}

	if (!mediaEl) return;
	applyStreamToMedia(mediaEl, stream, tileState.hasVideo, tileState.vol, selectOutputDeviceId(state), {
		isLocal: tileState.isLocal,
		tile,
		forceTileMediaRefresh
	});

	if (tileState.isLocal && stream) {
		mediaDebugWireStreamVideoTracks(stream, `tile:${peerId}`);
		const vids = stream.getVideoTracks?.() ?? [];
		const anyLive = vids.some((t) => t && t.readyState === "live");
		if (vids.length && !anyLive) {
			mediaDebugLog("tile:local:no-live-video-after-attach", {
				peerId,
				stream: mediaDebugStreamInfo(stream)
			});
		}
	}

	const hasActiveAudio = stream?.getAudioTracks?.().length > 0 && stream.getAudioTracks().some((tr) => tr.enabled && tr.readyState === "live");
	stopSpeakingIndicator(peerId);
	const containerForIndicator = app || document.getElementById("app") || document.body;
	if (hasActiveAudio) startSpeakingIndicator(peerId, stream, containerForIndicator);

	if (container.id === "video-gallery") {
		updateVideoGalleryColumns();
		const gallery = document.getElementById("video-gallery");
		if (gallery?.dataset.layoutMode === "free") {
			const idx = [...container.querySelectorAll(".video-tile")].findIndex((t) => t.dataset.peerId === peerId);
			if (idx >= 0) setupFreeLayoutTile(tile, peerId, idx);
		}
	}
}

export function detachRemoteAudio(peerId) {
	const container = document.getElementById("video-gallery") || document.getElementById("remote-audio-container") || document.body;
	const tile = container?.querySelector(`.video-tile[data-peer-id="${peerId}"]`);
	tile?.querySelector("audio.video-tile__remote-audio")?.remove();
	if (tile) tile.remove();
	if (container?.id === "video-gallery") updateVideoGalleryColumns();
}

export function applyOutputDeviceToAllAudios(deviceId) {
	const container = document.getElementById("video-gallery") || document.getElementById("remote-audio-container") || document.body;
	container?.querySelectorAll("video, audio").forEach((mediaEl) => {
		if (deviceId && mediaEl.setSinkId) mediaEl.setSinkId(deviceId).catch(() => {});
	});
	/* Notification tones run through the shared AudioContext, which has its own sink. */
	applySharedAudioContextSink(deviceId);
}

/**
 * Returns the remote stream (camera/mic) for a given peer ID from state.
 */
export function getStreamForPeerId(peerId) {
	const state = getState();
	if (peerId === selectMyPeerId(state)) return selectLocalStream(state);
	return selectRemoteStreams(state).get(peerId) ?? null;
}

/**
 * Returns the stream for a video tile (camera stream, not screen share). Alias for getStreamForPeerId.
 */
export function getStreamForVideoTile(peerId) {
	return getStreamForPeerId(peerId);
}

/**
 * Returns the screen-share stream for the given peer ID.
 */
export function getStreamForScreenShare(peerId) {
	const state = getState();
	return selectScreenStreams(state).get(peerId)?.stream ?? null;
}
