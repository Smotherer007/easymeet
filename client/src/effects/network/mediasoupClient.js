/**
 * mediasoup client – Protoo like mediasoup-demo (`_reference/mediasoup-demo/app/src/RoomClient.js`).
 * Public API unchanged for bootstrap / roomView.
 *
 * Flows follow versatica/mediasoup-demo (ISC).
 */

import * as mediasoupClient from "mediasoup-client";
import { AwaitQueue } from "awaitqueue";
import * as cryptoUtil from "../../utils/crypto.js";
import { mediaDebugLog, mediaDebugStreamInfo, mediaDebugTrackInfo } from "../../utils/mediaDebug.js";
import { logMsInfo, logMsWarn, logMsError } from "../../utils/easymeetLog.js";
import { replaceEmojiShortcodes } from "../../utils/emojiShortcodes.js";
import { getAudioProcessingConstraints } from "../storage/audioSettingsStorage.js";
import { getClientId } from "../storage/clientIdentity.js";
import { showToast } from "../../utils/toast.js";
import { sanitizeEasymeetPayload } from "../../protocol/validate.js";
import protooPkg from "protoo-client";

const ProtooPeer = protooPkg.Peer;
const WebSocketTransport = protooPkg.WebSocketTransport;

const CHUNK_SIZE = 16384;
const CHUNK_DELAY_MS = 30;
/* Matching server-side FILE_TRANSFER_MAX_BYTES (protooSignaling.js). Enforced
 * on the receiver to prevent RAM exhaustion from a malicious peer whose chunks
 * slipped past the server (e.g. due to a bug or a bypassed size field). */
const MAX_INCOMING_FILE_BYTES = 250 * 1024 * 1024;

/** Like mediasoup-demo RoomClient.js – empty object, placeholder for optional proprietaryConstraints */
const PC_PROPRIETARY_CONSTRAINTS = {};

function isWebcamVideoSource(src) {
	return src === "cam" || src === "video";
}

function isScreenShareSource(src) {
	return src === "screen" || src === "screensharing";
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

/**
 * Protoo WebSocket URL.
 *
 * - **Behind NPM/443:** always `wss://<same Origin>/ws` — no `:3001` on the public domain.
 * - **Vite dev only (port 5173):** use `hostname:3001/ws` directly because the Vite WS proxy for `/ws` often
 *   does not reliably forward the "protoo" subprotocol.
 * - **vite preview / edge cases:** `VITE_MEDIASOUP_PROTOO_DIRECT=true` forces the backend port again.
 */
function canonicalRoomIdForProtoo(roomId) {
	const s = String(roomId ?? "")
		.trim()
		.replace(/[^A-Z0-9]/gi, "")
		.toUpperCase();
	return s || String(roomId ?? "").trim();
}

function getProtooUrl(roomId, peerId, wsToken) {
	const proto = location.protocol === "https:" ? "wss:" : "ws:";
	const id = canonicalRoomIdForProtoo(roomId);
	const q = new URLSearchParams({ roomId: id, peerId, token: wsToken, clientId: getClientId() });

	const isViteDevServer = typeof location !== "undefined" && String(location.port) === "5173";
	const forceDirectBackend = import.meta.env.VITE_MEDIASOUP_PROTOO_DIRECT === "true" || import.meta.env.VITE_MEDIASOUP_PROTOO_DIRECT === "1";

	if (isViteDevServer || forceDirectBackend) {
		const port = import.meta.env.VITE_MEDIASOUP_PROTOO_PORT || "3001";
		const url = `${proto}//${location.hostname}:${port}/ws?${q}`;
		logMsInfo("Protoo direct (Vite dev or VITE_MEDIASOUP_PROTOO_DIRECT):", url);
		return url;
	}

	const base = new URL(location.origin);
	base.protocol = proto;
	const wsUrl = new URL("/ws", base);
	wsUrl.search = q.toString();
	const out = wsUrl.toString();
	logMsInfo("Protoo via page origin (e.g. 443 behind proxy):", out);
	return out;
}

async function notifyEasymeet(protoo, payload) {
	if (protoo.closed) return;
	await protoo.notify("easymeet", payload);
}

/* ---------- getUserMedia etc. ---------- */

export async function getUserMedia(inputDeviceId = null, requestVideo = true, videoDeviceId = null) {
	const videoOnly = requestVideo === "videoOnly";
	/**
	 * Explicit device (settings / stored ID): use `exact` — otherwise Chromium often ignores
	 * `ideal` and keeps the first mic/camera.
	 */
	const audioProc = videoOnly ? null : getAudioProcessingConstraints();
	const constraints = {
		audio: videoOnly
			? false
			: {
					...audioProc,
					...(inputDeviceId && String(inputDeviceId).length ? { deviceId: { exact: inputDeviceId } } : {})
				},
		video:
			requestVideo && requestVideo !== false
				? {
						/* 16:9 – virtual backgrounds/blur render in the camera frame; 4:3 looked stretched */
						aspectRatio: { ideal: 16 / 9 },
						width: { ideal: 1280 },
						height: { ideal: 720 },
						...(videoDeviceId && String(videoDeviceId).length ? { deviceId: { exact: videoDeviceId } } : {})
					}
				: false
	};
	return navigator.mediaDevices.getUserMedia(constraints);
}

function isStaleDeviceConstraintError(e) {
	const n = e?.name;
	return n === "OverconstrainedError" || n === "NotFoundError" || n === "ConstraintNotSatisfiedError";
}

export async function getUserMediaResilient(inputDeviceId, requestVideo, videoDeviceId) {
	const combos = [
		[inputDeviceId ?? null, videoDeviceId ?? null],
		[null, videoDeviceId ?? null],
		[inputDeviceId ?? null, null],
		[null, null]
	];
	const seen = new Set();
	let lastErr;
	for (const [a, vId] of combos) {
		const key = `${a}|${vId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		try {
			return await getUserMedia(a || undefined, requestVideo, vId || undefined);
		} catch (e) {
			lastErr = e;
			if (e?.name === "NotAllowedError" || e?.name === "SecurityError") throw e;
			if (!isStaleDeviceConstraintError(e)) throw e;
		}
	}
	throw lastErr ?? new Error("getUserMedia failed");
}

export async function getAudioDevices() {
	const devices = await navigator.mediaDevices.enumerateDevices();
	const inputs = devices.filter((d) => d.kind === "audioinput");
	const outputs = devices.filter((d) => d.kind === "audiooutput");
	return { inputs, outputs };
}

export async function getVideoDevices() {
	const devices = await navigator.mediaDevices.enumerateDevices();
	return devices.filter((d) => d.kind === "videoinput");
}

export async function getScreenStream() {
	return navigator.mediaDevices.getDisplayMedia({
		video: { cursor: "always" },
		audio: true
	});
}

/**
 * RTT from WebRTC stats: prefer selected/nominated candidate-pair,
 * else any pair with currentRoundTripTime, else inbound-rtp roundTripTime (seconds).
 * @param {RTCStatsReport | Map<string, object>} stats
 * @returns {number|null} milliseconds
 */
function extractRttMsFromRtcStats(stats) {
	if (!stats || typeof stats.forEach !== "function") return null;
	/** @type {{ ms: number; prio: number }[]} */
	const ranked = [];
	/** @type {number[]} */
	const anyPairMs = [];

	stats.forEach((report) => {
		if (report.type !== "candidate-pair") return;
		const rtt = report.currentRoundTripTime;
		if (typeof rtt !== "number" || rtt <= 0) return;
		const ms = Math.round(rtt * 1000);
		anyPairMs.push(ms);
		let prio = 0;
		if (report.selected === true) prio = 3;
		else if (report.nominated === true) prio = 2;
		else if (report.state === "succeeded") prio = 1;
		if (prio > 0) ranked.push({ ms, prio });
	});

	if (ranked.length) {
		for (const p of [3, 2, 1]) {
			const subset = ranked.filter((f) => f.prio === p).map((f) => f.ms);
			if (subset.length) return Math.min(...subset);
		}
	}
	/* Browsers sometimes omit selected/nominated — smallest RTT is usually the active pair */
	if (anyPairMs.length) return Math.min(...anyPairMs);

	const rtpMs = [];
	stats.forEach((report) => {
		if (report.type !== "remote-inbound-rtp" && report.type !== "inbound-rtp") return;
		const rt = report.roundTripTime;
		if (typeof rt !== "number" || rt <= 0) return;
		rtpMs.push(Math.round(rt * 1000));
	});
	if (rtpMs.length) return Math.round(rtpMs.reduce((a, b) => a + b, 0) / rtpMs.length);

	return null;
}

/**
 * Estimated packet loss (%) from inbound-rtp / remote-inbound-rtp, averaged across transports.
 * @param {RTCStatsReport | Map<string, object>} stats
 * @returns {number|null}
 */
function extractPacketLossPercent(stats) {
	if (!stats || typeof stats.forEach !== "function") return null;
	let recv = 0;
	let lost = 0;
	stats.forEach((r) => {
		if (r.type !== "inbound-rtp" && r.type !== "remote-inbound-rtp") return;
		if (typeof r.packetsReceived === "number" && r.packetsReceived >= 0) recv += r.packetsReceived;
		if (typeof r.packetsLost === "number" && r.packetsLost >= 0) lost += r.packetsLost;
	});
	if (recv + lost === 0) return null;
	return (100 * lost) / (recv + lost);
}

/* ---------- Transports (protoo requests) ---------- */

async function createSendTransport(protoo, device) {
	const transportInfo = await protoo.request("createWebRtcTransport", {
		sctpCapabilities: undefined,
		forceTcp: false,
		appData: { direction: "producer" }
	});

	const { transportId, iceParameters, iceCandidates, dtlsParameters, sctpParameters } = transportInfo;

	const transport = device.createSendTransport({
		id: transportId,
		iceParameters,
		iceCandidates,
		dtlsParameters: { ...dtlsParameters, role: "auto" },
		sctpParameters,
		iceServers: [],
		proprietaryConstraints: PC_PROPRIETARY_CONSTRAINTS,
		additionalSettings: { encodedInsertableStreams: false }
	});

	transport.on("connect", ({ dtlsParameters: dtls }, callback, errback) => {
		protoo.request("connectWebRtcTransport", { transportId: transport.id, dtlsParameters: dtls }).then(callback).catch(errback);
	});

	transport.on("produce", async ({ kind, rtpParameters, appData }, callback, errback) => {
		try {
			const { producerId } = await protoo.request("produce", {
				transportId: transport.id,
				kind,
				rtpParameters,
				appData
			});
			callback({ id: producerId });
		} catch (e) {
			errback(e);
		}
	});

	return transport;
}

async function createRecvTransport(protoo, device) {
	const transportInfo = await protoo.request("createWebRtcTransport", {
		sctpCapabilities: undefined,
		forceTcp: false,
		appData: { direction: "consumer" }
	});

	const { transportId, iceParameters, iceCandidates, dtlsParameters, sctpParameters } = transportInfo;

	const transport = device.createRecvTransport({
		id: transportId,
		iceParameters,
		iceCandidates,
		dtlsParameters: { ...dtlsParameters, role: "auto" },
		sctpParameters,
		iceServers: [],
		proprietaryConstraints: PC_PROPRIETARY_CONSTRAINTS,
		additionalSettings: { encodedInsertableStreams: false }
	});

	transport.on("connect", ({ dtlsParameters: dtls }, callback, errback) => {
		protoo.request("connectWebRtcTransport", { transportId: transport.id, dtlsParameters: dtls }).then(callback).catch(errback);
	});

	return transport;
}

/* ---------- produce (aligned with mediasoup-demo RoomClient enableMic / enableWebcam) ---------- */

async function produceDemoMic(sendTransport, track) {
	if (!track || !sendTransport) return null;
	if (track.readyState !== "live") {
		logMsWarn("produceDemoMic skipped: track not live:", track.readyState);
		return null;
	}
	/* No absCaptureTime: Easymeet router uses standard codecs only (see server/mediasoup/config.js). */
	return sendTransport.produce({
		track,
		codecOptions: {
			opusStereo: true,
			opusDtx: true,
			opusFec: true,
			opusNack: true
		},
		appData: { source: "audio" }
	});
}

async function produceDemoWebcam(sendTransport, track) {
	if (!track || !sendTransport) return null;
	if (track.readyState !== "live") {
		logMsWarn("produceDemoWebcam skipped: track not live:", track.readyState);
		return null;
	}
	return sendTransport.produce({
		track,
		codecOptions: { videoGoogleStartBitrate: 1000 },
		appData: { source: "video" }
	});
}

/** Screen share: demo uses source "screensharing" for streamId mapping */
async function produceDemoScreenTrack(sendTransport, track) {
	if (!track || !sendTransport) return null;
	const base = {
		track,
		appData: { source: "screensharing" }
	};
	if (track.kind === "video") {
		return sendTransport.produce({
			...base,
			codecOptions: { videoGoogleStartBitrate: 1000 }
		});
	}
	return sendTransport.produce({
		...base,
		codecOptions: {
			opusStereo: true,
			opusDtx: true,
			opusFec: true,
			opusNack: true
		}
	});
}

/* ---------- Peer-ID ---------- */

function generatePeerId() {
	const arr = new Uint8Array(8);
	crypto.getRandomValues(arr);
	return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createPeer() {
	const peerId = generatePeerId();
	return Promise.resolve({ peer: { id: peerId, _ms: true, destroy() {} }, id: peerId });
}

/* ---------- File handling ---------- */

function createFileDataHandler(dispatch, roomId = "", password = "") {
	let fileBuffer = [];
	let fileMeta = null;
	let chunkQueue = [];
	let chunkProcessing = false;
	let currentFileId = "";
	let bytesReceived = 0;
	let aborted = false;

	function resetFileState() {
		fileBuffer = [];
		chunkQueue = [];
		fileMeta = null;
		currentFileId = "";
		bytesReceived = 0;
		aborted = false;
	}

	function abortTransfer(reason) {
		if (aborted) return;
		aborted = true;
		logMsWarn(`file transfer aborted: ${reason}`);
		try {
			showToast(`Datei-Empfang abgebrochen: ${reason}`, { type: "warning" });
		} catch (_) {}
		if (dispatch && fileMeta) {
			dispatch({
				type: "file/aborted",
				payload: {
					filename: fileMeta.filename,
					reason,
					fileId: currentFileId,
					nick: fileMeta.fromNick
				}
			});
		}
		resetFileState();
	}

	async function processChunkQueue() {
		if (chunkProcessing || !chunkQueue.length) return;
		chunkProcessing = true;
		while (chunkQueue.length) {
			if (aborted) {
				chunkQueue.length = 0;
				break;
			}
			const data = chunkQueue.shift();
			let chunk = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data);
			if (fileMeta?.encrypted && password && roomId) {
				const key = await cryptoUtil.deriveKey(password, roomId);
				const decrypted = await cryptoUtil.decrypt(chunk, key);
				chunk = new Uint8Array(decrypted);
			}
			bytesReceived += chunk.byteLength || chunk.length || 0;
			if (bytesReceived > MAX_INCOMING_FILE_BYTES) {
				chunkProcessing = false;
				abortTransfer(`Limit ${MAX_INCOMING_FILE_BYTES / (1024 * 1024)} MB überschritten`);
				return;
			}
			fileBuffer.push(chunk);
			if (dispatch && fileMeta?.size) {
				dispatch({
					type: "file/progress",
					payload: {
						filename: fileMeta.filename,
						bytesReceived,
						total: fileMeta.size,
						speedKbps: 0,
						fileId: currentFileId,
						nick: fileMeta.fromNick
					}
				});
			}
		}
		chunkProcessing = false;
	}

	return (data) => {
		if (typeof data === "object" && data !== null && !(data instanceof ArrayBuffer)) {
			if (data.type === "file_start") {
				/* Reject oversized files up-front based on the advertised size; later
				 * chunks are still capped by bytesReceived in processChunkQueue(). */
				const declaredSize = Number(data.size) || 0;
				if (declaredSize > MAX_INCOMING_FILE_BYTES) {
					logMsWarn(`file_start rejected: declared size ${declaredSize} > cap`);
					try {
						showToast(`Datei abgelehnt: ${Math.round(declaredSize / (1024 * 1024))} MB > ${MAX_INCOMING_FILE_BYTES / (1024 * 1024)} MB`, { type: "warning" });
					} catch (_) {}
					resetFileState();
					return;
				}
				currentFileId = data.fileId || "";
				fileMeta = {
					filename: data.filename,
					mimeType: data.mimeType || "application/octet-stream",
					size: data.size,
					encrypted: data.encrypted,
					fromNick: data.fromNick || "?"
				};
				fileBuffer = [];
				bytesReceived = 0;
				aborted = false;
				if (dispatch && fileMeta.size) {
					dispatch({
						type: "file/progress",
						payload: {
							filename: fileMeta.filename,
							bytesReceived: 0,
							total: fileMeta.size,
							speedKbps: 0,
							fileId: currentFileId,
							nick: fileMeta.fromNick
						}
					});
				}
				return;
			}
			if (data.type === "file_end" && fileMeta) {
				if (aborted) {
					resetFileState();
					return;
				}
				const blob = new Blob(fileBuffer, { type: fileMeta.mimeType });
				dispatch?.({
					type: "file/received",
					payload: {
						filename: fileMeta.filename,
						blob,
						mimeType: fileMeta.mimeType,
						fileId: currentFileId,
						fromNick: fileMeta.fromNick
					}
				});
				resetFileState();
				return;
			}
			if (data.type === "file_chunk" && data.chunk) {
				if (aborted) return;
				const binary = Uint8Array.from(atob(data.chunk), (c) => c.charCodeAt(0));
				chunkQueue.push(binary.buffer);
				processChunkQueue();
				return;
			}
		}
		if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
			if (aborted) return;
			chunkQueue.push(data);
			processChunkQueue();
		}
	};
}

export async function sendFileToViewers(protoo, file, onProgress, roomId = "", password = "", fromNick = "", fileId = "") {
	const filename = file.name || "download";
	const mimeType = file.type || "application/octet-stream";
	await notifyEasymeet(protoo, {
		type: "file_start",
		fileId,
		filename,
		size: file.size,
		mimeType,
		encrypted: !!(password && roomId),
		fromNick
	});
	const buffer = await file.arrayBuffer();
	const totalChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE);
	let key = null;
	if (password && roomId) key = await cryptoUtil.deriveKey(password, roomId);
	for (let i = 0; i < totalChunks; i++) {
		const start = i * CHUNK_SIZE;
		const end = Math.min(start + CHUNK_SIZE, buffer.byteLength);
		let chunk = buffer.slice(start, end);
		if (key) chunk = await cryptoUtil.encrypt(chunk, key);
		const b64 = btoa(String.fromCharCode(...new Uint8Array(chunk)));
		await notifyEasymeet(protoo, { type: "file_chunk", chunk: b64 });
		if (onProgress) onProgress({ bytesSent: end, total: buffer.byteLength });
		if (i < totalChunks - 1) await sleep(CHUNK_DELAY_MS);
	}
	await notifyEasymeet(protoo, { type: "file_end", filename });
}

/* ---------- setupRoomParticipant ---------- */

export async function setupRoomParticipant(peerObj, nick, localStream, callbacks = {}) {
	const { dispatch, roomId = "", password = "", wsToken = "", getLocalStream, getLocalBackgroundEffect, getMuted } = callbacks;

	const peerId = peerObj.id;
	if (!wsToken || String(wsToken).trim() === "") {
		logMsWarn("setupRoomParticipant: wsToken missing — call POST /api/join first");
	}
	const url = getProtooUrl(roomId, peerId, wsToken);
	logMsInfo("setupRoomParticipant", { roomId: roomId || "(empty!)", peerId, nick });
	if (!roomId || String(roomId).trim() === "") {
		logMsWarn("roomId missing — Protoo/join will fail on server. Check state after create/join API.");
	}
	const transport = new WebSocketTransport(url);
	const protoo = new ProtooPeer(transport);

	const producers = new Map();
	const consumers = new Map();
	const peerStreams = new Map();
	/** One MediaStream per peer for screen share (video+audio); demo streamId "…-screensharing" */
	const peerScreenStreams = new Map();
	let screenProducers = [];
	const fileHandler = dispatch ? createFileDataHandler(dispatch, roomId, password) : null;
	let membersRef = [];

	function getMemberNick(pid) {
		const m = membersRef.find((x) => x.peerId === pid);
		return m?.nick ?? "?";
	}

	/** @type {import('mediasoup-client').Device | null} */
	let device = null;
	let sendTransport = null;
	let recvTransport = null;

	/** Serialized with produceLocalTracks (retry timer): avoids !cam + live video → second produce/replace race after effect 2 */
	let _updateLock = false;
	let _pendingStream = null;
	/** @type {{ forceMicProducer?: boolean } | null} */
	let _pendingOptions = null;

	/** Like mediasoup-demo RoomClient: AwaitQueue for newConsumer */
	const consumingAwaitQueue = new AwaitQueue();

	function handleEasymeetPayload(rawMsg) {
		/* Sanitize every server-originated payload: caps string lengths, coerces
		 * types, drops structurally broken entries. Protects the UI/store from a
		 * compromised server or MITM pushing overlong fields or wrong types. */
		const msg = sanitizeEasymeetPayload(rawMsg);
		if (!msg?.type) return;
		switch (msg.type) {
			case "new_peer": {
				if (msg.peerId === peerId) break;
				const exists = membersRef.some((m) => m.peerId === msg.peerId);
				if (!exists) {
					membersRef.push({
						peerId: msg.peerId,
						nick: msg.nick ?? "?",
						handRaised: !!msg.handRaised
					});
					dispatch?.({ type: "voip/membersUpdated", payload: { members: [...membersRef] } });
					dispatch?.({ type: "room/memberJoined", payload: { peerId: msg.peerId, nick: msg.nick ?? "?" } });
					dispatch?.({ type: "chat/messageReceived", payload: { type: "join", nick: msg.nick, peerId: msg.peerId } });
				} else {
					const row = membersRef.find((m) => m.peerId === msg.peerId);
					if (row) {
						if (msg.nick) row.nick = msg.nick;
						if (msg.handRaised !== undefined) row.handRaised = !!msg.handRaised;
					}
					dispatch?.({ type: "voip/membersUpdated", payload: { members: [...membersRef] } });
				}
				if (msg.videoEnabled !== undefined) {
					dispatch?.({ type: "voip/videoStateUpdated", payload: { peerId: msg.peerId, isVideoEnabled: msg.videoEnabled } });
				}
				if (msg.backgroundEffect !== undefined) {
					dispatch?.({ type: "voip/backgroundEffectUpdated", payload: { peerId: msg.peerId, effect: msg.backgroundEffect } });
				}
				if (msg.muted !== undefined) {
					dispatch?.({ type: "voip/muteReceived", payload: { peerId: msg.peerId, isMuted: msg.muted } });
				}
				break;
			}
			case "peer_left": {
				if (msg.peerId === peerId) break;
				membersRef = membersRef.filter((m) => m.peerId !== msg.peerId);
				dispatch?.({ type: "voip/membersUpdated", payload: { members: [...membersRef] } });
				dispatch?.({ type: "room/leave", payload: { peerId: msg.peerId } });
				dispatch?.({ type: "voip/remoteStreamEnded", payload: { peerId: msg.peerId } });
				dispatch?.({ type: "chat/messageReceived", payload: { type: "leave", nick: msg.nick ?? "?", peerId: msg.peerId } });
				peerStreams.delete(msg.peerId);
				peerScreenStreams.delete(msg.peerId);
				break;
			}
			case "members_updated":
				membersRef = msg.members || [];
				dispatch?.({ type: "voip/membersUpdated", payload: { members: membersRef } });
				dispatch?.({
					type: "chat/membersUpdated",
					payload: { list: membersRef.map((m) => m.nick).filter(Boolean) }
				});
				/* mute/video/bg come in the snapshot — reduceVoipMembersUpdated owns the maps.
				 * Avoid N× voip/* events or attachRemoteAudio thrashes (audio drop / camera flicker, e.g. after hand_raise). */
				if (peerId) {
					const me = membersRef.find((m) => m.peerId === peerId);
					dispatch?.({ type: "room/handRaisedSelf", payload: { peerId, raised: !!me?.handRaised } });
				}
				break;
			case "chat":
				dispatch?.({
					type: "chat/messageReceived",
					payload: { type: "chat", nick: msg.nick, text: msg.text, ts: msg.ts, giphyUrls: msg.giphyUrls || [] }
				});
				break;
			case "file_share":
				dispatch?.({
					type: "chat/messageReceived",
					payload: { type: "file_share", nick: msg.nick, filename: msg.filename, ts: msg.ts, fileId: msg.fileId }
				});
				break;
			case "mute":
				dispatch?.({ type: "voip/muteReceived", payload: { peerId: msg.peerId, isMuted: msg.muted } });
				break;
			case "video":
				dispatch?.({ type: "voip/videoStateUpdated", payload: { peerId: msg.peerId, isVideoEnabled: msg.videoEnabled } });
				break;
			case "background_effect":
				dispatch?.({ type: "voip/backgroundEffectUpdated", payload: { peerId: msg.peerId, effect: msg.effect } });
				break;
			case "screen_sharing_stopped":
				dispatch?.({ type: "voip/screenStreamStopped", payload: { peerId: msg.peerId } });
				break;
			case "file_start":
			case "file_end":
			case "file_chunk":
				fileHandler?.(msg);
				break;
			case "reaction":
				dispatch?.({ type: "room/reaction", payload: { peerId: msg.peerId, emoji: msg.emoji } });
				break;
			case "reaction_effect":
				dispatch?.({ type: "room/reactionEffect", payload: { peerId: msg.peerId, effect: msg.effect } });
				break;
			case "hand_raise": {
				const row = membersRef.find((m) => m.peerId === msg.peerId);
				if (row) row.handRaised = !!msg.raised;
				dispatch?.({ type: "voip/membersUpdated", payload: { members: [...membersRef] } });
				if (msg.peerId === peerId) {
					dispatch?.({ type: "room/handRaisedSelf", payload: { peerId, raised: !!msg.raised } });
				}
				break;
			}
			case "poll_created":
			case "poll_update":
				if (msg.poll) dispatch?.({ type: "room/pollUpsert", payload: { poll: msg.poll } });
				break;
			default:
				break;
		}
	}

	protoo.on("request", async (request, accept, reject) => {
		if (request.method !== "newConsumer") {
			reject(403, `unknown request ${request.method}`);
			return;
		}

		try {
			await consumingAwaitQueue.push(async () => {
				if (!recvTransport) {
					throw new Error("recvTransport not ready");
				}
				const data = request.data || {};
				const { peerId: remotePeerId, consumerId, producerId, kind, rtpParameters, appData = {} } = data;

				if (!consumerId || !producerId || !kind || !rtpParameters) {
					throw new Error(`newConsumer: invalid data ${JSON.stringify(Object.keys(data))}`);
				}

				const src = appData?.source || "audio";
				const streamSuffix = isScreenShareSource(src) ? "screensharing" : "audio-video";

				const consumer = await recvTransport.consume({
					id: consumerId,
					producerId,
					kind,
					rtpParameters,
					streamId: `${remotePeerId}-${streamSuffix}`,
					appData: { ...appData, peerId: remotePeerId }
				});

				consumers.set(consumer.id, { consumer, peerId: remotePeerId, source: src });

				consumer.on("transportclose", () => consumers.delete(consumer.id));

				if (isScreenShareSource(src)) {
					let screenStream = peerScreenStreams.get(remotePeerId);
					if (!screenStream) {
						screenStream = new MediaStream();
						peerScreenStreams.set(remotePeerId, screenStream);
					}
					screenStream.addTrack(consumer.track);
					dispatch?.({
						type: "voip/screenStreamStarted",
						payload: { peerId: remotePeerId, nick: getMemberNick(remotePeerId), stream: screenStream }
					});
				} else {
					let peerStream = peerStreams.get(remotePeerId);
					if (!peerStream) {
						peerStream = new MediaStream();
						peerStreams.set(remotePeerId, peerStream);
					}
					peerStream.addTrack(consumer.track);

					if (kind === "video" && isWebcamVideoSource(src)) {
						dispatch?.({ type: "voip/videoStateUpdated", payload: { peerId: remotePeerId, isVideoEnabled: true } });
					}

					dispatch?.({
						type: "voip/remoteStreamAdded",
						payload: { peerId: remotePeerId, nick: getMemberNick(remotePeerId), stream: peerStream }
					});

					const t = consumer.track;
					if (t && t.kind === "video") {
						const redispatch = () => {
							const ps = peerStreams.get(remotePeerId);
							if (ps) {
								dispatch?.({
									type: "voip/remoteStreamAdded",
									payload: { peerId: remotePeerId, nick: getMemberNick(remotePeerId), stream: ps }
								});
							}
						};
						t.addEventListener("unmute", redispatch, { once: true });
						t.addEventListener("ended", () => t.removeEventListener("unmute", redispatch), { once: true });
					}
				}

				accept();
				logMsInfo("newConsumer ok", { remotePeerId, kind, source: src, consumerId });
				try {
					if (consumer.paused) consumer.resume();
					if (consumer.track) consumer.track.enabled = true;
				} catch (e) {
					logMsWarn("consumer local resume after newConsumer", e);
				}
				/* No resumeConsumer to server: consumer is created server-side with paused:false —
				 * notify + consumer.resume() there triggered "Channel request handler … consumer.resume" in the worker. */
			});
		} catch (err) {
			logMsError("newConsumer failed", err);
			try {
				reject(err instanceof Error ? err : new Error(String(err)));
			} catch (_) {}
		}
	});

	protoo.on("notification", (notification) => {
		const { method, data } = notification;
		if (method === "easymeet") {
			handleEasymeetPayload(data);
			return;
		}
		if (method === "newPeer" && data?.peer) {
			const p = data.peer;
			if (!membersRef.some((m) => m.peerId === p.peerId)) {
				handleEasymeetPayload({
					type: "new_peer",
					peerId: p.peerId,
					nick: p.displayName ?? "?"
				});
			}
			return;
		}
		if (method === "peerClosed" && data?.peerId) {
			handleEasymeetPayload({
				type: "peer_left",
				peerId: data.peerId,
				nick: getMemberNick(data.peerId)
			});
			return;
		}
		if (method === "consumerClosed" && data?.consumerId) {
			const closedId = data.consumerId;
			void consumingAwaitQueue.push(async () => {
				const info = consumers.get(closedId);
				if (!info) return;
				const wasVideo = info.consumer.kind === "video" && isWebcamVideoSource(info.source);
				info.consumer.close();
				consumers.delete(closedId);
				const srcPeerId = info.peerId;
				if (isScreenShareSource(info.source)) {
					const ss = peerScreenStreams.get(srcPeerId);
					if (ss) {
						ss.removeTrack(info.consumer.track);
						if (ss.getTracks().length === 0) peerScreenStreams.delete(srcPeerId);
					}
					if (!peerScreenStreams.has(srcPeerId)) {
						dispatch?.({ type: "voip/screenStreamStopped", payload: { peerId: srcPeerId } });
					} else {
						dispatch?.({
							type: "voip/screenStreamStarted",
							payload: { peerId: srcPeerId, nick: getMemberNick(srcPeerId), stream: peerScreenStreams.get(srcPeerId) }
						});
					}
				} else {
					const peerStream = peerStreams.get(srcPeerId);
					if (peerStream) {
						peerStream.removeTrack(info.consumer.track);
					}
					if (wasVideo) {
						const ps = peerStreams.get(srcPeerId);
						const stillHasLiveVideo = ps?.getVideoTracks?.()?.some((t) => t && t.readyState === "live");
						if (!stillHasLiveVideo) {
							dispatch?.({ type: "voip/videoStateUpdated", payload: { peerId: srcPeerId, isVideoEnabled: false } });
						}
					}
					if (peerStream && peerStream.getTracks().length === 0) {
						peerStreams.delete(srcPeerId);
						dispatch?.({ type: "voip/remoteStreamEnded", payload: { peerId: srcPeerId } });
					}
				}
			});
		}
	});

	await new Promise((resolve, reject) => {
		let settled = false;
		const done = (fn) => {
			if (settled) return;
			settled = true;
			fn();
		};
		protoo.on("open", () => {
			done(() => {
				logMsInfo("Protoo socket open (protoo subprotocol)");
				resolve();
			});
		});
		protoo.on("failed", (attempt) => {
			done(() => {
				logMsWarn(
					"Protoo WebSocket failed after retries. Attempt:",
					attempt,
					"| URL:",
					url,
					"| Server reachable? NPM must proxy /ws (WebSocket) to Node. Local: npm run dev:all"
				);
				reject(new Error(`protoo WebSocket failed (attempt ${attempt})`));
			});
		});
		protoo.on("close", () => {
			done(() => reject(new Error("protoo closed before open")));
		});
	});

	let produceRetryTimer = null;
	let produceRetryCount = 0;
	const MAX_PRODUCE_RETRIES = 60;
	let lastProduceLogSig = "";

	function clearProduceRetryTimer() {
		if (produceRetryTimer != null) {
			clearTimeout(produceRetryTimer);
			produceRetryTimer = null;
		}
	}

	try {
		const { routerRtpCapabilities } = await protoo.request("getRouterRtpCapabilities");

		device = await mediasoupClient.Device.factory({});
		await device.load({
			routerRtpCapabilities,
			preferLocalCodecsOrder: true
		});
		logMsInfo("mediasoup Device loaded", { handler: device.handlerName });

		/**
		 * Like mediasoup-demo RoomClient._joinRoom(): brief mic access (track muted) unlocks
		 * autoplay for remote audio/video in Chromium/Safari — otherwise often black tile / no sound.
		 */
		try {
			const unlockStream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const unlockTrack = unlockStream.getAudioTracks()[0];
			if (unlockTrack) {
				unlockTrack.enabled = false;
				setTimeout(() => {
					try {
						unlockTrack.stop();
					} catch (_) {}
				}, 120000);
			}
		} catch (e) {
			logMsWarn("Autoplay unlock (optional):", e?.message || e);
		}

		sendTransport = await createSendTransport(protoo, device);
		recvTransport = await createRecvTransport(protoo, device);
		logMsInfo("WebRtcTransports created", { send: sendTransport?.id, recv: recvTransport?.id });

		recvTransport.on("connectionstatechange", (cs) => {
			logMsInfo("recvTransport connectionState:", cs);
			if (cs === "failed" || cs === "disconnected") {
				logMsWarn("Recv transport disconnected/failed — often ICE/announcedIp. Local test: MEDIASOUP_ANNOUNCED_IP=127.0.0.1");
			}
		});
		sendTransport.on("connectionstatechange", (cs) => {
			logMsInfo("sendTransport connectionState:", cs);
		});

		const getStream = typeof getLocalStream === "function" ? getLocalStream : typeof localStream === "function" ? localStream : () => localStream;

		const videoEnabled =
			getStream()
				?.getVideoTracks?.()
				.some((t) => t.enabled) ?? false;
		const backgroundEffect = getLocalBackgroundEffect?.() ?? "none";
		/** Like initialState.isMuted (false): without callback do not falsely signal muted */
		const muted = getMuted?.() ?? false;

		const { peers, easymeetPolls, easymeetChatHistory } = await protoo.request("join", {
			displayName: nick,
			device: { flag: "easymeet", name: "Easymeet" },
			rtpCapabilities: device.rtpCapabilities,
			sctpCapabilities: undefined,
			easymeet: { muted, videoEnabled, backgroundEffect }
		});

		membersRef = [
			{ peerId, nick, handRaised: false },
			...(peers || []).map((p) => ({ peerId: p.peerId, nick: p.displayName ?? "?", handRaised: false }))
		];
		dispatch?.({ type: "voip/membersUpdated", payload: { members: [...membersRef] } });
		if (Array.isArray(easymeetPolls) && easymeetPolls.length) {
			dispatch?.({ type: "room/pollsSet", payload: { polls: easymeetPolls } });
		}
		if (Array.isArray(easymeetChatHistory) && easymeetChatHistory.length) {
			dispatch?.({ type: "chat/historyRestored", payload: { messages: easymeetChatHistory } });
		}
		dispatch?.({
			type: "chat/membersUpdated",
			payload: { list: membersRef.map((m) => m.nick).filter(Boolean) }
		});

		function trackUsable(t) {
			return t && t.readyState !== "ended";
		}

		async function produceLocalTracks() {
			const stream = getStream();
			if (!stream) return;
			const audioTrack = stream.getAudioTracks()[0];
			const videoTrack = stream.getVideoTracks()[0];
			if (trackUsable(audioTrack) && !producers.has("mic")) {
				try {
					const p = await produceDemoMic(sendTransport, audioTrack);
					if (p) producers.set("mic", p);
				} catch (e) {
					logMsError("Audio produce failed:", e?.message || e);
				}
			}
			if (trackUsable(videoTrack) && !producers.has("cam") && !_updateLock) {
				try {
					const p = await produceDemoWebcam(sendTransport, videoTrack);
					if (p) producers.set("cam", p);
				} catch (e) {
					logMsError("Video produce failed:", e?.message || e);
				}
			}
			const logSig = [producers.has("mic"), producers.has("cam"), !!trackUsable(stream.getAudioTracks()[0]), !!trackUsable(stream.getVideoTracks()[0])].join("|");
			if (logSig !== lastProduceLogSig) {
				lastProduceLogSig = logSig;
				logMsInfo("produceLocalTracks", {
					hatMicProducer: producers.has("mic"),
					hatCamProducer: producers.has("cam"),
					streamAudio: !!trackUsable(stream.getAudioTracks()[0]),
					streamVideo: !!trackUsable(stream.getVideoTracks()[0])
				});
			}
		}

		function scheduleProduceRetry() {
			clearProduceRetryTimer();
			produceRetryTimer = setTimeout(async () => {
				produceRetryTimer = null;
				if (protoo.closed) return;
				produceRetryCount++;
				if (produceRetryCount > MAX_PRODUCE_RETRIES) return;
				try {
					await produceLocalTracks();
				} catch (e) {
					logMsWarn("produce retry:", e?.message || e);
				}
				const stream = getStream();
				const liveA = stream?.getAudioTracks?.()?.some((t) => t.readyState === "live");
				const liveV = stream?.getVideoTracks?.()?.some((t) => t.readyState === "live");
				const missingForTracks = (liveA && !producers.has("mic")) || (liveV && !producers.has("cam"));
				const stillNoTracks = !liveA && !liveV;
				if (missingForTracks || stillNoTracks) scheduleProduceRetry();
			}, 500);
		}

		await produceLocalTracks();
		scheduleProduceRetry();
	} catch (setupErr) {
		try {
			sendTransport?.close();
			recvTransport?.close();
		} catch (_) {}
		try {
			if (!protoo.closed) protoo.close();
		} catch (_) {}
		throw setupErr;
	}

	async function closeProducerById(producerId) {
		if (protoo.closed) return;
		await protoo.notify("closeProducer", { producerId });
	}

	function sendChat(nickName, text, ts, giphyUrlOrUrls) {
		const giphyUrls = Array.isArray(giphyUrlOrUrls) ? giphyUrlOrUrls : giphyUrlOrUrls ? [giphyUrlOrUrls] : [];
		const expanded = replaceEmojiShortcodes(text);
		notifyEasymeet(protoo, { type: "chat", nick: nickName, text: expanded, ts, giphyUrls });
		dispatch?.({ type: "chat/messageReceived", payload: { type: "chat", nick: nickName, text: expanded, ts, giphyUrls } });
	}

	async function setScreenStream(stream) {
		if (stream) {
			notifyEasymeet(protoo, { type: "screen_stream", peerId, nick });
			const videoTrack = stream.getVideoTracks()[0];
			const audioTrack = stream.getAudioTracks()[0];
			if (videoTrack) {
				const p = await produceDemoScreenTrack(sendTransport, videoTrack);
				if (p) {
					screenProducers.push(p);
					producers.set("screen_video", p);
				}
			}
			if (audioTrack) {
				const p = await produceDemoScreenTrack(sendTransport, audioTrack);
				if (p) {
					screenProducers.push(p);
					producers.set("screen_audio", p);
				}
			}
		}
	}

	function clearScreenStream() {
		screenProducers.forEach((p) => {
			closeProducerById(p.id);
			p.close();
		});
		screenProducers = [];
		producers.delete("screen_video");
		producers.delete("screen_audio");
	}

	function broadcastScreenSharing(pid, nickName) {
		notifyEasymeet(protoo, { type: "screen_stream", peerId: pid, nick: nickName });
	}

	function broadcastScreenSharingStopped(pid) {
		notifyEasymeet(protoo, { type: "screen_sharing_stopped", peerId: pid });
	}

	function broadcastFileShare(nickName, filename, ts, fileId) {
		notifyEasymeet(protoo, { type: "file_share", nick: nickName, filename, ts, fileId });
		dispatch?.({ type: "chat/messageReceived", payload: { type: "file_share", nick: nickName, filename, ts, fileId } });
	}

	function broadcastMute(pid, mutedState) {
		notifyEasymeet(protoo, { type: "mute", muted: mutedState });
		dispatch?.({ type: "voip/muteReceived", payload: { peerId: pid, isMuted: mutedState } });
	}

	function broadcastVideo(pid, videoEnabledState) {
		notifyEasymeet(protoo, { type: "video", videoEnabled: videoEnabledState });
		dispatch?.({ type: "voip/videoStateUpdated", payload: { peerId: pid, isVideoEnabled: videoEnabledState } });
	}

	function broadcastBackgroundEffect(pid, effect) {
		notifyEasymeet(protoo, { type: "background_effect", effect: effect || "none" });
		dispatch?.({ type: "voip/backgroundEffectUpdated", payload: { peerId: pid, effect: effect || "none" } });
	}

	/**
	 * @param {MediaStream} newStream
	 * @param {{ forceMicProducer?: boolean; skipCamProducerChanges?: boolean }} [options]
	 * `skipCamProducerChanges`: mic/gate update without touching the cam producer (recovery mute with virtual background).
	 */
	async function updateLocalStream(newStream, options = {}) {
		if (!newStream) return;
		if (_updateLock) {
			mediaDebugLog("ms:update-local-stream:queued", { stream: mediaDebugStreamInfo(newStream), options });
			_pendingStream = newStream;
			_pendingOptions = {
				forceMicProducer: Boolean(options.forceMicProducer || _pendingOptions?.forceMicProducer),
				skipCamProducerChanges: Boolean(
					options.skipCamProducerChanges || _pendingOptions?.skipCamProducerChanges
				)
			};
			return;
		}
		_updateLock = true;
		try {
			await _doUpdateLocalStream(newStream, options);
		} finally {
			_updateLock = false;
			if (_pendingStream) {
				const next = _pendingStream;
				const nextOpts = _pendingOptions || {};
				_pendingStream = null;
				_pendingOptions = null;
				try {
					await updateLocalStream(next, nextOpts);
				} catch (e2) {
					logMsError("updateLocalStream (queued chain):", e2?.message || e2);
					mediaDebugLog("ms:update-local-stream:queued-failed", { message: e2?.message || String(e2) });
				}
			}
		}
	}

	/**
	 * @param {MediaStream} newStream
	 * @param {{ forceMicProducer?: boolean }} [options]
	 */
	async function _doUpdateLocalStream(newStream, options = {}) {
		try {
			const skipCamProducerChanges = options.skipCamProducerChanges === true;
			/* First *live* track — otherwise after producer close/stop a dead track often stays at index 0 (logs: track ended). */
			const newAudioTrack =
				(newStream.getAudioTracks?.() ?? []).find((t) => t && t.readyState === "live") ?? null;
			const newVideoTrack =
				(newStream.getVideoTracks?.() ?? []).find((t) => t && t.readyState === "live") ?? null;
			const micProducer = producers.get("mic");
			const camProducer = producers.get("cam");
			mediaDebugLog("ms:do-update-local-stream:start", {
				in: mediaDebugStreamInfo(newStream),
				newVideo: mediaDebugTrackInfo(newVideoTrack),
				camProducerTrack: mediaDebugTrackInfo(camProducer?.track),
				hadCamProducer: Boolean(camProducer),
				skipCamProducerChanges
			});
			/* Like webcam: replaceTrack alone is often not enough (Web Audio destination / device switch). */
			if (micProducer && newAudioTrack) {
				/* micNoiseGate: output is always the same destination track; raw mic is rewired in wireInput only.
				 * forceMicProducer + same track ref → do not close producer: close() would tear down the gate output. */
				const sameGateDestinationTrack =
					micProducer.track === newAudioTrack &&
					newAudioTrack.readyState === "live" &&
					micProducer.track.readyState !== "ended";
				if (sameGateDestinationTrack) {
					mediaDebugLog("ms:mic-producer:keep-same-destination-track", {
						forceMicProducer: Boolean(options.forceMicProducer)
					});
				} else {
				const needNewMicProducer =
					options.forceMicProducer === true ||
					micProducer.track !== newAudioTrack ||
					micProducer.track.readyState === "ended";
				if (needNewMicProducer) {
					mediaDebugLog("ms:mic-producer:recreate", {
						reason: micProducer.track?.readyState === "ended" ? "old-ended" : "track-swap",
						new: mediaDebugTrackInfo(newAudioTrack)
					});
					try {
						await closeProducerById(micProducer.id);
						micProducer.close();
						producers.delete("mic");
						const p = await produceDemoMic(sendTransport, newAudioTrack);
						if (p) producers.set("mic", p);
						mediaDebugLog("ms:mic-producer:recreate:done", { ok: Boolean(p) });
					} catch (re) {
						logMsWarn("Mic producer recreate failed:", re?.message || re);
						mediaDebugLog("ms:mic-producer:recreate:done", { ok: false, error: re?.message || String(re) });
						try {
							const p = await produceDemoMic(sendTransport, newAudioTrack);
							if (p) producers.set("mic", p);
						} catch (re2) {
							logMsWarn("Mic producer second attempt failed:", re2?.message || re2);
						}
					}
				} else {
					try {
						await micProducer.replaceTrack({ track: newAudioTrack });
					} catch (re) {
						logMsWarn("replaceTrack(mic) failed, new producer:", re?.message || re);
						await closeProducerById(micProducer.id);
						micProducer.close();
						producers.delete("mic");
						const p = await produceDemoMic(sendTransport, newAudioTrack);
						if (p) producers.set("mic", p);
					}
				}
				}
			} else if (!micProducer && newAudioTrack) {
				const p = await produceDemoMic(sendTransport, newAudioTrack);
				if (p) producers.set("mic", p);
			} else if (micProducer && !newAudioTrack) {
				await closeProducerById(micProducer.id);
				micProducer.close();
				producers.delete("mic");
			}
			/* replaceTrack often insufficient for MediaStreamTrackGenerator / effect pipeline — encoder stays on old track.
			 * Create new producer (server closes duplicate webcam producers in produce anyway). */
			if (!skipCamProducerChanges) {
				if (camProducer && newVideoTrack) {
					/* Also recreate if producer still references an ended track (effect switch / pipeline stop). */
					const needNewCamProducer = camProducer.track !== newVideoTrack || camProducer.track.readyState === "ended";
					if (needNewCamProducer) {
						mediaDebugLog("ms:cam-producer:recreate", {
							reason: camProducer.track?.readyState === "ended" ? "old-track-ended" : "track-swap"
						});
						try {
							await closeProducerById(camProducer.id);
							camProducer.close();
							producers.delete("cam");
							const p = await produceDemoWebcam(sendTransport, newVideoTrack);
							if (p) producers.set("cam", p);
							mediaDebugLog("ms:cam-producer:recreate:done", {
								ok: Boolean(p),
								newProducerTrack: mediaDebugTrackInfo(p?.track)
							});
						} catch (re) {
							logMsWarn("Cam producer recreate failed:", re?.message || re);
							mediaDebugLog("ms:cam-producer:recreate:done", { ok: false, error: re?.message || String(re) });
						}
					} else {
						mediaDebugLog("ms:cam-producer:keep", {
							trackId: newVideoTrack?.id,
							readyState: newVideoTrack?.readyState
						});
					}
				} else if (!camProducer && newVideoTrack) {
					const p = await produceDemoWebcam(sendTransport, newVideoTrack);
					if (p) producers.set("cam", p);
					mediaDebugLog("ms:cam-producer:first", { ok: Boolean(p), track: mediaDebugTrackInfo(p?.track) });
				} else if (camProducer && !newVideoTrack) {
					/* No live video in stream but producer track still live: often a race (device recovery
					 * mute-unmute, effect switch) — do not kill producer. Camera intentionally off: track is ended. */
					if (camProducer.track && camProducer.track.readyState === "live") {
						mediaDebugLog("ms:cam-producer:keep-despite-no-live-video-in-stream", {
							producerTrack: mediaDebugTrackInfo(camProducer.track)
						});
					} else {
						await closeProducerById(camProducer.id);
						camProducer.close();
						producers.delete("cam");
						mediaDebugLog("ms:cam-producer:removed", { reason: "no-video-in-stream" });
					}
				}
			} else {
				mediaDebugLog("ms:cam-producer:skip-changes", {
					reason: "device-recovery-mute-sync",
					hadCamProducer: Boolean(camProducer)
				});
			}
			mediaDebugLog("ms:do-update-local-stream:done", {
				hasCam: producers.has("cam"),
				hasMic: producers.has("mic")
			});
		} catch (e) {
			logMsError("updateLocalStream (mediasoup):", e);
			mediaDebugLog("ms:do-update-local-stream:error", { message: e?.message || String(e) });
			/* Do not rethrow: would break the updateLocalStream queue and surface uncaught (in promise). */
		}
	}

	function close() {
		clearProduceRetryTimer();
		consumers.forEach((info) => info.consumer.close());
		consumers.clear();
		producers.forEach((p) => p.close());
		producers.clear();
		sendTransport?.close();
		recvTransport?.close();
		peerStreams.clear();
		peerScreenStreams.clear();
		screenProducers = [];
		if (!protoo.closed) protoo.close();
	}

	function sendMute(mutedState) {
		notifyEasymeet(protoo, { type: "mute", muted: mutedState });
	}

	function sendVideo(videoEnabledState) {
		notifyEasymeet(protoo, { type: "video", videoEnabled: videoEnabledState });
	}

	function sendBackgroundEffect(effect) {
		notifyEasymeet(protoo, { type: "background_effect", effect: effect || "none" });
	}

	function sendFileShare(fileId, filename, ts) {
		notifyEasymeet(protoo, { type: "file_share", nick, filename, ts, fileId });
	}

	/** Mean RTT send/recv to SFU (WebRTC candidate-pair), for UI. */
	async function getWebRtcRttMs() {
		const rtts = [];
		for (const tr of [sendTransport, recvTransport]) {
			if (!tr || tr.closed) continue;
			try {
				const s = await tr.getStats();
				const ms = extractRttMsFromRtcStats(s);
				if (ms != null) rtts.push(ms);
			} catch (_) {
				/* ignore */
			}
		}
		if (!rtts.length) return null;
		return Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length);
	}

	/**
	 * RTT + packet loss + coarse quality tier for the meeting header.
	 * @returns {Promise<{ rttMs: number|null; packetLossPercent: number|null; quality: 'good'|'fair'|'poor'|'unknown' }>}
	 */
	async function getWebRtcConnectionStats() {
		const rttMs = await getWebRtcRttMs();
		const losses = [];
		for (const tr of [sendTransport, recvTransport]) {
			if (!tr || tr.closed) continue;
			try {
				const s = await tr.getStats();
				const p = extractPacketLossPercent(s);
				if (p != null) losses.push(p);
			} catch (_) {
				/* ignore */
			}
		}
		const packetLossPercent = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : null;
		if (rttMs == null && packetLossPercent == null) {
			return { rttMs: null, packetLossPercent: null, quality: "unknown" };
		}
		const rScore = rttMs == null ? 0 : rttMs > 220 ? 2 : rttMs > 110 ? 1 : 0;
		const lScore = packetLossPercent == null ? 0 : packetLossPercent > 12 ? 2 : packetLossPercent > 4 ? 1 : 0;
		const worst = Math.max(rScore, lScore);
		const quality = worst === 0 ? "good" : worst === 1 ? "fair" : "poor";
		return { rttMs, packetLossPercent, quality };
	}

	const wsShim = {
		get readyState() {
			return protoo.closed ? 3 : 1;
		},
		close: () => close(),
		send: () => {},
		OPEN: 1,
		CLOSED: 3
	};

	return {
		sendChat,
		setScreenStream,
		clearScreenStream,
		broadcastScreenSharing,
		broadcastScreenSharingStopped,
		broadcastFileShare,
		broadcastMute,
		broadcastVideo,
		broadcastBackgroundEffect,
		updateLocalStream,
		close,

		conn: {
			get open() {
				return protoo.connected && !protoo.closed;
			},
			send: (msg) => {
				if (msg?.type) {
					void notifyEasymeet(protoo, msg).catch((e) => logMsWarn("easymeet notify failed", msg?.type, e?.message || e));
				}
			},
			close: () => close(),
			on: () => {}
		},
		sendMute,
		sendVideo,
		sendBackgroundEffect,
		sendFileShare,

		ws: wsShim,
		peerId,
		protoo,
		sendWs: (data) => {
			if (data?.type) {
				void notifyEasymeet(protoo, data).catch((e) => logMsWarn("easymeet notify failed", data?.type, e?.message || e));
			}
		},
		sendFileToRoom: (file, onProgress, fromNick, fileId) => sendFileToViewers(protoo, file, onProgress, roomId, password, fromNick, fileId),

		getWebRtcRttMs,
		getWebRtcConnectionStats
	};
}
