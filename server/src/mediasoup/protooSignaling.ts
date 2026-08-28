import { randomUUID } from "node:crypto";
import { normalizeRoomCode } from "../roomCode.ts";
import {
	getOrCreateRoom,
	getRoom,
	closePeer,
	createPeerState,
	createWebRtcTransport,
	cleanupMediasoupPeerResources,
	appendRoomChatEntry,
	getChatHistorySnapshot,
	type PeerState,
	type RoomState,
	type Poll,
	type WebRtcTransportInfo,
} from "./rooms.ts";
import {
	logProtooInfo,
	logProtooWarn,
	logProtooError,
	runWithLogContextAsync,
} from "../logger.ts";
import { consumeHandshakeToken } from "../wsJoinTokens.ts";
import { EasymeetErrorCode, protooErrorReason } from "../easymeetErrors.ts";
import { REACTION_EFFECT_IDS } from "../shared/reactionEffectIds.ts";
import { sanitizeClientId } from "../authz.ts";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { WebSocketServer: ProtooWebSocketServer } = require("protoo-server") as { WebSocketServer: new (server: import("node:http").Server, opts?: Record<string, unknown>) => import("protoo-server").WebSocketServer };

import type { Peer as ProtooPeer } from "protoo-server";

type ChatEntry =
	| { type: "chat"; nick: string; text: string; ts: number; giphyUrls: string[] }
	| { type: "file_share"; nick: string; filename: string; ts: number; fileId: string; mimeType: string };

const REACTION_EFFECT_ID_SET = new Set(REACTION_EFFECT_IDS);

const FILE_TRANSFER_MAX_BYTES = 250 * 1024 * 1024;
const FILE_CHUNK_B64_MAX = 900_000;
const SPAM_WINDOW_MS = 10_000;
const WS_CHAT_PER_WINDOW = Math.max(5, Number(process.env.EASYMEET_WS_CHAT_PER_10S || 20));
const WS_FILE_CHUNKS_PER_WINDOW = Math.max(20, Number(process.env.EASYMEET_WS_FILE_CHUNKS_PER_10S || 160));

function buildMembersList(room: RoomState) {
	return Array.from(room.peers.values())
		.filter((p) => p.joined)
		.map((p) => ({
			peerId: p.peerId,
			nick: p.nick,
			muted: p.muted,
			videoEnabled: p.videoEnabled,
			backgroundEffect: p.backgroundEffect,
			handRaised: !!p.handRaised,
		}));
}

function sanitizeReactionEmoji(raw: string): string {
	if (typeof raw !== "string") return "";
	const s = raw.trim().slice(0, 16);
	if (!s || /[<>]/.test(s) || /[{}\u0000-\u001f]/.test(s)) return "";
	return s;
}

function sanitizeReactionEffect(raw: string): string {
	if (typeof raw !== "string") return "";
	const s = raw.trim();
	return REACTION_EFFECT_ID_SET.has(s) ? s : "";
}

function isAllowedGiphyMediaUrl(raw: string): boolean {
	try {
		const u = new URL(raw);
		if (u.protocol !== "http:" && u.protocol !== "https:") return false;
		const h = u.hostname.toLowerCase();
		return (
			h === "media.tenor.com" ||
			h.endsWith(".tenor.com") ||
			h === "c.tenor.com" ||
			h.endsWith(".giphy.com") ||
			h === "media.giphy.com" ||
			h === "i.giphy.com"
		);
	} catch {
		return false;
	}
}

function sanitizeGiphyUrls(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	const out: string[] = [];
	for (const u of raw) {
		if (typeof u !== "string") continue;
		const s = u.trim().slice(0, 2048);
		if (!s || !isAllowedGiphyMediaUrl(s)) continue;
		out.push(s);
		if (out.length >= 10) break;
	}
	return out;
}

function sanitizeMimeType(raw: string): string {
	if (typeof raw !== "string") return "application/octet-stream";
	const s = raw.trim().slice(0, 128);
	return /^[\w.+/=-]+$/i.test(s) ? s : "application/octet-stream";
}

interface FileStartMsg {
	type: string;
	fileId: string;
	filename: string;
	size: number;
	mimeType: string;
	encrypted: boolean;
	fromNick: string;
}

function sanitizeFileStartNotification(msg: Record<string, unknown>, msPeer: PeerState): FileStartMsg | null {
	const fileId = typeof msg.fileId === "string" ? msg.fileId.trim().slice(0, 128) : "";
	const filename = typeof msg.filename === "string" ? msg.filename.trim().slice(0, 256) : "";
	let size = typeof msg.size === "number" && Number.isFinite(msg.size) ? Math.floor(msg.size) : 0;
	if (size < 0) size = 0;
	if (size > FILE_TRANSFER_MAX_BYTES) size = FILE_TRANSFER_MAX_BYTES;
	const mimeType = sanitizeMimeType(typeof msg.mimeType === "string" ? msg.mimeType : "");
	const encrypted = Boolean(msg.encrypted);
	const nick = typeof msPeer.nick === "string" ? msPeer.nick.trim().slice(0, 128) : "?";
	const fromNick = nick || "?";
	if (!filename) return null;
	return { type: "file_start", fileId, filename, size, mimeType, encrypted, fromNick };
}

function sanitizeFileEndNotification(msg: Record<string, unknown>): { type: string; filename: string } | null {
	const filename = typeof msg.filename === "string" ? msg.filename.trim().slice(0, 256) : "";
	if (!filename) return null;
	return { type: "file_end", filename };
}

function sanitizeFileChunkNotification(msg: Record<string, unknown>): { type: string; chunk: string } | null {
	if (typeof msg.chunk !== "string") return null;
	const chunk = msg.chunk.slice(0, FILE_CHUNK_B64_MAX);
	if (!chunk) return null;
	return { type: "file_chunk", chunk };
}

function bumpPeerSpamCounter(msPeer: PeerState, key: "chatCount" | "fileChunkCount"): number {
	const now = Date.now();
	if (!msPeer.spamState || now - msPeer.spamState.windowStart > SPAM_WINDOW_MS) {
		msPeer.spamState = { windowStart: now, chatCount: 0, fileChunkCount: 0 };
	}
	msPeer.spamState[key] += 1;
	return msPeer.spamState[key];
}

function buildSanitizedChatClientEntry(msg: Record<string, unknown>, msPeer: PeerState): ChatEntry | null {
	const nick = typeof msg.nick === "string" ? msg.nick.trim().slice(0, 128) : msPeer.nick || "?";
	const text = typeof msg.text === "string" ? msg.text.slice(0, 4000) : "";
	const ts = Number(msg.ts) || Date.now();
	const giphyUrls = sanitizeGiphyUrls(msg.giphyUrls);
	if (!text.trim() && !giphyUrls.length) return null;
	return { type: "chat", nick, text, ts, giphyUrls };
}

function buildSanitizedFileShareClientEntry(
	msg: Record<string, unknown>,
	msPeer: PeerState
): ChatEntry | null {
	const nick = typeof msg.nick === "string" ? msg.nick.trim().slice(0, 128) : msPeer.nick || "?";
	const filename = typeof msg.filename === "string" ? msg.filename.trim().slice(0, 256) : "";
	const fileId = typeof msg.fileId === "string" ? msg.fileId.trim().slice(0, 128) : "";
	const mimeType = sanitizeMimeType(typeof msg.mimeType === "string" ? msg.mimeType : "");
	const ts = Number(msg.ts) || Date.now();
	if (!filename || !fileId) return null;
	return { type: "file_share", nick, filename, ts, fileId, mimeType };
}

function serializePollPublic(poll: Poll) {
	const tallies = poll.options.map(() => 0);
	for (const v of poll.votes.values()) {
		if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < tallies.length) {
			tallies[v] += 1;
		} else if (Array.isArray(v)) {
			for (const idx of v) {
				if (typeof idx === "number" && Number.isInteger(idx) && idx >= 0 && idx < tallies.length) tallies[idx] += 1;
			}
		}
	}
	return {
		id: poll.id,
		question: poll.question,
		options: [...poll.options],
		tallies,
		closed: !!poll.closed,
		creatorPeerId: poll.creatorPeerId,
	};
}

function getPollsSnapshot(room: RoomState) {
	if (!room.polls?.size) return [];
	return [...room.polls.values()].map(serializePollPublic);
}

function serializeProtoPeer(msPeer: PeerState) {
	return {
		peerId: msPeer.peerId,
		displayName: msPeer.nick,
		device: { flag: "easymeet", name: "Easymeet" },
	};
}

function getConsumerTransport(msPeer: PeerState): import("mediasoup").types.Transport | null {
	for (const t of msPeer.transports.values()) {
		if ((t.appData as Record<string, unknown> | undefined)?.direction === "consumer") return t;
	}
	return null;
}

function safeProtooNotify(protooPeer: ProtooPeer | null, method: string, data: unknown): void {
	if (!protooPeer) return;
	Promise.resolve(protooPeer.notify(method, data)).catch(() => {});
}

function broadcastEasymeet(roomId: string, payload: object, excludePeerId: string | null = null): void {
	const room = getRoom(roomId);
	if (!room) return;
	for (const p of room.peers.values()) {
		if (!p.joined || p.peerId === excludePeerId) continue;
		safeProtooNotify(p.protooPeer, "easymeet", payload);
	}
}

async function consumeProducerForPeer(
	consumerPeer: PeerState,
	producer: import("mediasoup").types.Producer,
	room: RoomState
): Promise<void> {
	const transport = getConsumerTransport(consumerPeer);
	if (!transport) return;
	if (!consumerPeer.joined || !consumerPeer.rtpCapabilities) return;

	if (
		!room.router.canConsume({
			producerId: producer.id,
			rtpCapabilities: consumerPeer.rtpCapabilities,
		})
	) {
		logProtooWarn("canConsume false", {
			peerId: consumerPeer.peerId,
			producerId: producer.id,
			kind: producer.kind,
		});
		return;
	}

	let consumer: import("mediasoup").types.Consumer;
	try {
		consumer = await transport.consume({
			producerId: producer.id,
			rtpCapabilities: consumerPeer.rtpCapabilities,
			enableRtx: true,
			paused: false,
			ignoreDtx: true,
			appData: {
				peerId: producer.appData.peerId,
				source: (producer.appData as Record<string, unknown>).source || "mic",
			},
		});
	} catch (err) {
		logProtooWarn("consumeProducerForPeer failed", (err as Error)?.message || err);
		return;
	}

	consumerPeer.consumers.set(consumer.id, consumer);

	consumer.on("transportclose", () => {
		consumerPeer.consumers.delete(consumer.id);
	});

	consumer.on("producerclose", () => {
		consumerPeer.consumers.delete(consumer.id);
		safeProtooNotify(consumerPeer.protooPeer, "consumerClosed", { consumerId: consumer.id });
	});

	/* Forward SFU consumer scores to the client so it can adapt simulcast layers
	 * (see client handleConsumerScore in mediasoupClient.js). The worker reports
	 * scores roughly every second. */
	consumer.on("score", (score) => {
		safeProtooNotify(consumerPeer.protooPeer, "consumerScore", { consumerId: consumer.id, score });
	});

	/* Current spatial/temporal layer of a simulcast consumer (telemetry/debug). */
	consumer.on("layerschange", (layers) => {
		safeProtooNotify(consumerPeer.protooPeer, "consumerLayersChanged", { consumerId: consumer.id, layers });
	});

	const protooPeer = consumerPeer.protooPeer;
	if (!protooPeer) {
		consumer.close();
		consumerPeer.consumers.delete(consumer.id);
		return;
	}

	try {
		await protooPeer.request("newConsumer", {
			peerId: producer.appData.peerId,
			transportId: transport.id,
			consumerId: consumer.id,
			producerId: producer.id,
			kind: consumer.kind,
			rtpParameters: consumer.rtpParameters,
			type: consumer.type,
			producerPaused: consumer.producerPaused,
			consumerScore: consumer.score,
			appData: consumer.appData,
		});
	} catch (err) {
		logProtooWarn("newConsumer request failed", (err as Error)?.message || err);
		try { consumer.close(); } catch { /* ignore */ }
		consumerPeer.consumers.delete(consumer.id);
	}
}

async function notifyExistingProducersToNewPeer(room: RoomState, joiningPeer: PeerState): Promise<void> {
	const tasks: Promise<void>[] = [];
	for (const other of room.peers.values()) {
		if (other.peerId === joiningPeer.peerId || !other.joined) continue;
		for (const producer of other.producers.values()) {
			tasks.push(consumeProducerForPeer(joiningPeer, producer, room));
		}
	}
	if (tasks.length) await Promise.allSettled(tasks);
}

async function notifyNewProducerToOthers(
	room: RoomState,
	producingPeerId: string,
	producer: import("mediasoup").types.Producer
): Promise<void> {
	const tasks: Promise<void>[] = [];
	for (const other of room.peers.values()) {
		if (other.peerId === producingPeerId || !other.joined) continue;
		tasks.push(consumeProducerForPeer(other, producer, room));
	}
	if (tasks.length) await Promise.allSettled(tasks);
}

function attachPeerToRoom(roomId: string, room: RoomState, msPeer: PeerState, protooPeer: ProtooPeer): void {
	msPeer.protooPeer = protooPeer;

	protooPeer.on("close", () => {
		const roomNow = getRoom(roomId);
		if (!roomNow) return;
		const still = roomNow.peers.get(msPeer.peerId);
		if (!still) return;
		const nick = still.nick ?? "?";
		const leftId = msPeer.peerId;

		broadcastEasymeet(roomId, { type: "peer_left", peerId: leftId, nick }, leftId);

		closePeer(roomId, leftId, { closeProtooPeer: false });

		const roomAfter = getRoom(roomId);
		if (roomAfter) {
			broadcastEasymeet(roomId, { type: "members_updated", members: buildMembersList(roomAfter) }, null);
		}
	});

	protooPeer.on("request", async (rawRequest, accept, reject) => {
		const request = rawRequest as { method: string; data: Record<string, unknown> };
		try {
			await runWithLogContextAsync(
				{
					connectionId: msPeer.connectionId || "",
					roomId,
					peerId: msPeer.peerId,
				},
				async () => {
					await handleProtooRequest(roomId, room, msPeer, request, accept, reject);
				}
			);
		} catch (err) {
			logProtooError("request error", request.method, (err as Error)?.message || err);
			reject(err instanceof Error ? err : new Error(String(err)));
		}
	});

	protooPeer.on("notification", (rawNotification) => {
		const notification = rawNotification as { method: string; data: Record<string, unknown> };
		handleProtooNotification(roomId, room, msPeer, notification).catch((e) => {
			logProtooWarn("notification error", notification.method, (e as Error)?.message || e);
		});
	});
}

async function handleProtooRequest(
	roomId: string,
	room: RoomState,
	msPeer: PeerState,
	request: { method: string; data: Record<string, unknown> },
	accept: (payload?: unknown) => void,
	reject: (error?: unknown) => void
): Promise<void> {
	const { method, data } = request;

	switch (method) {
		case "getRouterRtpCapabilities": {
			accept({ routerRtpCapabilities: room.router.rtpCapabilities });
			break;
		}

		case "join": {
			if (msPeer.joined) {
				reject(new Error(protooErrorReason(EasymeetErrorCode.PEER_ALREADY_JOINED, "Peer already joined")));
				return;
			}
			const { displayName, rtpCapabilities, sctpCapabilities, easymeet } = data;

			const dn = typeof displayName === "string" ? displayName.trim().slice(0, 128) : "";
			msPeer.nick = dn || msPeer.nick || "?";
			msPeer.rtpCapabilities = (rtpCapabilities ?? null) as object | null;
			msPeer.sctpCapabilities = (sctpCapabilities ?? null) as object | null;
			msPeer.joined = true;

			if (easymeet && typeof easymeet === "object") {
				const em = easymeet as Record<string, unknown>;
				if (em.muted !== undefined) msPeer.muted = Boolean(em.muted);
				if (em.videoEnabled !== undefined) msPeer.videoEnabled = Boolean(em.videoEnabled);
				if (em.backgroundEffect !== undefined) {
					msPeer.backgroundEffect = String(em.backgroundEffect ?? "none");
				}
			}

			const otherPeers = Array.from(room.peers.values()).filter(
				(p) => p.peerId !== msPeer.peerId && p.joined
			);

			for (const other of otherPeers) {
				safeProtooNotify(other.protooPeer, "newPeer", { peer: serializeProtoPeer(msPeer) });
			}
			broadcastEasymeet(
				roomId,
				{
					type: "new_peer",
					peerId: msPeer.peerId,
					nick: msPeer.nick,
					muted: msPeer.muted,
					videoEnabled: msPeer.videoEnabled,
					backgroundEffect: msPeer.backgroundEffect,
					handRaised: !!msPeer.handRaised,
				},
				msPeer.peerId
			);

			const peersPayload = otherPeers.map((p) => serializeProtoPeer(p));
			accept({
				peers: peersPayload,
				easymeetPolls: getPollsSnapshot(room),
				easymeetChatHistory: getChatHistorySnapshot(room),
			});

			await notifyExistingProducersToNewPeer(room, msPeer);

			const members = buildMembersList(room);
			broadcastEasymeet(roomId, { type: "members_updated", members }, null);
			break;
		}

		case "createWebRtcTransport": {
			const { sctpCapabilities, forceTcp, appData } = data;
			const direction = (appData as Record<string, unknown>)?.direction === "consumer" ? "consumer" : "producer";
			const info: WebRtcTransportInfo | null = await createWebRtcTransport(roomId, msPeer.peerId, {
				direction,
				sctpCapabilities: sctpCapabilities as { numStreams?: { OS: number; MIS: number } } | undefined,
				forceTcp: !!forceTcp,
			});
			if (!info) {
				reject(new Error(protooErrorReason(EasymeetErrorCode.TRANSPORT_CREATE_FAILED, "createWebRtcTransport failed")));
				return;
			}
			accept({
				transportId: info.id,
				iceParameters: info.iceParameters,
				iceCandidates: info.iceCandidates,
				dtlsParameters: info.dtlsParameters,
				sctpParameters: info.sctpParameters,
			});
			break;
		}

		case "connectWebRtcTransport": {
			const { transportId, dtlsParameters } = data;
			const transport = msPeer.transports.get(String(transportId));
			if (!transport) {
				reject(new Error(protooErrorReason(EasymeetErrorCode.TRANSPORT_NOT_FOUND, "transport not found")));
				return;
			}
			await transport.connect({ dtlsParameters: dtlsParameters as import("mediasoup").types.DtlsParameters });
			accept();
			break;
		}

		case "restartIce": {
			const { transportId } = data;
			const transport = msPeer.transports.get(String(transportId));
			if (!transport) {
				reject(new Error(protooErrorReason(EasymeetErrorCode.TRANSPORT_NOT_FOUND, "transport not found")));
				return;
			}
			const iceParameters = await (transport as any).restartIce();
			accept({ iceParameters });
			break;
		}

		case "produce": {
			if (!msPeer.joined) {
				reject(new Error(protooErrorReason(EasymeetErrorCode.NOT_JOINED, "not joined")));
				return;
			}
			const { transportId, kind, rtpParameters, appData } = data;
			const transport = msPeer.transports.get(String(transportId));
			if (!transport) {
				reject(new Error(protooErrorReason(EasymeetErrorCode.TRANSPORT_NOT_FOUND, "transport not found")));
				return;
			}

			const ad = appData as Record<string, unknown> | undefined;
			const incomingSource = ad?.source || "mic";
			if (kind === "video" && (incomingSource === "video" || incomingSource === "cam")) {
				for (const [existingId, existingProducer] of [...msPeer.producers.entries()]) {
					const src = existingProducer.appData?.source;
					if (src === "video" || src === "cam") {
						try { existingProducer.close(); } catch { /* ignore */ }
						msPeer.producers.delete(existingId);
					}
				}
			}

			const producer = await transport.produce({
				kind: kind as import("mediasoup").types.MediaKind,
				rtpParameters: rtpParameters as import("mediasoup").types.RtpParameters,
				enableMediasoupPacketIdHeaderExtension: true,
				appData: {
					...(ad || {}),
					peerId: msPeer.peerId,
					source: ad?.source || "mic",
				},
			});

			msPeer.producers.set(producer.id, producer);
			producer.on("transportclose", () => msPeer.producers.delete(producer.id));

			accept({ producerId: producer.id });

			await notifyNewProducerToOthers(room, msPeer.peerId, producer);
			break;
		}

		default:
			reject(
				new Error(protooErrorReason(EasymeetErrorCode.UNKNOWN_PROTOO_METHOD, `unknown method "${method}"`))
			);
	}
}

async function handleProtooNotification(
	roomId: string,
	room: RoomState,
	msPeer: PeerState,
	notification: { method: string; data: Record<string, unknown> }
): Promise<void> {
	const { method, data } = notification;

	switch (method) {
		case "closeProducer": {
			const producer = msPeer.producers.get(String(data.producerId));
			if (producer) {
				producer.close();
				msPeer.producers.delete(String(data.producerId));
			}
			break;
		}

		case "pauseProducer": {
			const producer = msPeer.producers.get(String(data.producerId));
			if (producer) await producer.pause();
			break;
		}

		case "resumeProducer": {
			const producer = msPeer.producers.get(String(data.producerId));
			if (producer) await producer.resume();
			break;
		}

		case "pauseConsumer": {
			const consumer = msPeer.consumers.get(String(data.consumerId));
			if (consumer) await consumer.pause();
			break;
		}

		case "resumeConsumer": {
			const consumer = msPeer.consumers.get(String(data.consumerId));
			if (consumer && consumer.paused && !consumer.closed) {
				try {
					await consumer.resume();
				} catch (e) {
					logProtooWarn("resumeConsumer", (e as Error)?.message || e);
				}
			}
			break;
		}

		case "easymeet": {
			const msg = data;
			if (!msg?.type) return;

			switch (String(msg.type)) {
				case "chat": {
					if (bumpPeerSpamCounter(msPeer, "chatCount") > WS_CHAT_PER_WINDOW) {
						logProtooWarn("chat rate limit exceeded", { peerId: msPeer.peerId, roomId });
						break;
					}
					const chatEntry = buildSanitizedChatClientEntry(msg, msPeer);
					if (!chatEntry) break;
					appendRoomChatEntry(room, chatEntry);
					broadcastEasymeet(roomId, { ...chatEntry, peerId: msPeer.peerId }, msPeer.peerId);
					break;
				}

				case "file_share": {
					const fileEntry = buildSanitizedFileShareClientEntry(msg, msPeer);
					if (!fileEntry) break;
					appendRoomChatEntry(room, fileEntry);
					broadcastEasymeet(roomId, { ...fileEntry, peerId: msPeer.peerId }, msPeer.peerId);
					break;
				}

				case "mute":
					msPeer.muted = Boolean(msg.muted ?? msPeer.muted);
					broadcastEasymeet(roomId, { type: "mute", peerId: msPeer.peerId, muted: msg.muted }, msPeer.peerId);
					broadcastEasymeet(roomId, { type: "members_updated", members: buildMembersList(room) }, null);
					break;

				case "video":
					msPeer.videoEnabled = Boolean(msg.videoEnabled ?? msPeer.videoEnabled);
					broadcastEasymeet(roomId, { type: "video", peerId: msPeer.peerId, videoEnabled: msg.videoEnabled }, msPeer.peerId);
					broadcastEasymeet(roomId, { type: "members_updated", members: buildMembersList(room) }, null);
					break;

				case "background_effect":
					msPeer.backgroundEffect = String(msg.effect ?? "none");
					broadcastEasymeet(
						roomId,
						{ type: "background_effect", peerId: msPeer.peerId, effect: msg.effect || "none" },
						msPeer.peerId
					);
					break;

				case "screen_stream":
					broadcastEasymeet(
						roomId,
						{ type: "screen_stream", peerId: msPeer.peerId, nick: msPeer.nick },
						msPeer.peerId
					);
					break;

				case "screen_sharing_stopped":
					broadcastEasymeet(roomId, { type: "screen_sharing_stopped", peerId: msPeer.peerId }, msPeer.peerId);
					break;

				case "file_start": {
					const sanitized = sanitizeFileStartNotification(msg, msPeer);
					if (sanitized) broadcastEasymeet(roomId, sanitized, msPeer.peerId);
					break;
				}
				case "file_end": {
					const sanitized = sanitizeFileEndNotification(msg);
					if (sanitized) broadcastEasymeet(roomId, sanitized, msPeer.peerId);
					break;
				}
				case "file_chunk": {
					if (bumpPeerSpamCounter(msPeer, "fileChunkCount") > WS_FILE_CHUNKS_PER_WINDOW) {
						logProtooWarn("file_chunk rate limit exceeded", { peerId: msPeer.peerId, roomId });
						break;
					}
					const sanitized = sanitizeFileChunkNotification(msg);
					if (sanitized) broadcastEasymeet(roomId, sanitized, msPeer.peerId);
					break;
				}

				case "reaction": {
					const emoji = sanitizeReactionEmoji(String(msg.emoji || ""));
					if (!emoji) break;
					broadcastEasymeet(roomId, { type: "reaction", peerId: msPeer.peerId, emoji, ts: Date.now() }, null);
					break;
				}

				case "reaction_effect": {
					const effect = sanitizeReactionEffect(String(msg.effect || ""));
					if (!effect) {
						logProtooWarn("reaction_effect ignored (unknown or invalid effect)", {
							peerId: msPeer.peerId,
							raw: typeof msg.effect === "string" ? String(msg.effect).slice(0, 64) : msg.effect,
						});
						break;
					}
					broadcastEasymeet(roomId, { type: "reaction_effect", peerId: msPeer.peerId, effect, ts: Date.now() }, null);
					break;
				}

				case "hand_raise": {
					msPeer.handRaised = Boolean(msg.raised);
					broadcastEasymeet(
						roomId,
						{ type: "hand_raise", peerId: msPeer.peerId, raised: msPeer.handRaised },
						msPeer.peerId
					);
					broadcastEasymeet(roomId, { type: "members_updated", members: buildMembersList(room) }, null);
					break;
				}

				case "poll_create": {
					const q = typeof msg.question === "string" ? String(msg.question).trim().slice(0, 200) : "";
					const rawOpts = Array.isArray(msg.options) ? msg.options : [];
					const opts = rawOpts.map((o) => String(o).trim().slice(0, 80)).filter(Boolean);
					if (q.length < 1 || opts.length < 2 || opts.length > 8) break;
					room.pollSeq = (room.pollSeq || 0) + 1;
					const pollId = `p${room.pollSeq}_${randomUUID().slice(0, 8)}`;
					const poll: Poll = {
						id: pollId,
						question: q,
						options: opts,
						votes: new Map(),
						creatorPeerId: msPeer.peerId,
						closed: false,
					};
					room.polls.set(pollId, poll);
					broadcastEasymeet(roomId, { type: "poll_created", poll: serializePollPublic(poll) }, null);
					break;
				}

				case "poll_vote": {
					const poll = room.polls?.get(String(msg.pollId || ""));
					if (!poll || poll.closed) break;
					const idx = Number(msg.optionIndex);
					if (!Number.isInteger(idx) || idx < 0 || idx >= poll.options.length) break;
					poll.votes.set(msPeer.peerId, idx);
					broadcastEasymeet(roomId, { type: "poll_update", poll: serializePollPublic(poll) }, null);
					break;
				}

				case "poll_close": {
					const poll = room.polls?.get(String(msg.pollId || ""));
					if (!poll || poll.creatorPeerId !== msPeer.peerId) break;
					poll.closed = true;
					broadcastEasymeet(roomId, { type: "poll_update", poll: serializePollPublic(poll) }, null);
					break;
				}

				default:
					break;
			}
			break;
		}

		default:
			break;
	}
}

export function attachProtooToHttpServer(
	httpServer: import("http").Server,
	options: { adminDb?: unknown; roomStore?: unknown } = {}
): import("protoo-server").WebSocketServer {
	const protooWss = new ProtooWebSocketServer(httpServer, {
		maxReceivedFrameSize: 960000,
		maxReceivedMessageSize: 960000,
		fragmentOutgoingMessages: true,
		fragmentationThreshold: 960000,
	});

	protooWss.on("connectionrequest", (rawInfo, rawAccept, rawReject) => {
		const info = rawInfo as { request: { url?: string; headers: Record<string, string | string[] | undefined> } };
		const accept = rawAccept;
		const reject = rawReject;

		try {
			const host = info.request.headers.host || "localhost";
			const u = new URL(String(info.request.url || "/"), `http://${host}`);

			if (u.pathname !== "/ws") {
				logProtooWarn("connection rejected: not /ws", u.pathname);
				reject(404, protooErrorReason(EasymeetErrorCode.WS_PATH_NOT_FOUND, "Not Found"));
				return;
			}

			const token = u.searchParams.get("token");
			const consumed = consumeHandshakeToken(token);
			if (!consumed) {
				logProtooWarn("connection rejected: missing or invalid WebSocket token (join again)");
				reject(403, protooErrorReason(EasymeetErrorCode.WS_TOKEN_INVALID, "Invalid or expired WebSocket token"));
				return;
			}

			const roomId = normalizeRoomCode(consumed.roomId);
			const peerId = consumed.peerId;
			const tokenClientId = sanitizeClientId(consumed.clientId);
			if (!roomId || !peerId) {
				logProtooWarn("connection rejected: invalid handshake payload");
				reject(400, protooErrorReason(EasymeetErrorCode.WS_HANDSHAKE_INVALID, "invalid handshake"));
				return;
			}

			const urlRoom = normalizeRoomCode(u.searchParams.get("roomId") || "");
			const urlPeer = (u.searchParams.get("peerId") || "").trim();
			const urlClientId = sanitizeClientId(u.searchParams.get("clientId") || "");
			if (urlRoom !== roomId || urlPeer !== peerId || urlClientId !== tokenClientId) {
				logProtooWarn("connection rejected: roomId/peerId mismatch vs token");
				reject(403, protooErrorReason(EasymeetErrorCode.WS_URL_TOKEN_MISMATCH, "WebSocket URL must match join response"));
				return;
			}

			(async () => {
				try {
					const room = await getOrCreateRoom(roomId);

					if (room.protooRoom.hasPeer(peerId)) {
						room.protooRoom.getPeer(peerId).close();
					}
					if (room.peers.has(peerId)) {
						cleanupMediasoupPeerResources(room, peerId);
					}

					const transport = accept();
					const protooPeer = room.protooRoom.createPeer(peerId, transport);
					const msPeer = createPeerState(peerId, "");
					msPeer.clientId = tokenClientId;
					msPeer.connectionId = randomUUID();
					room.peers.set(peerId, msPeer);

					attachPeerToRoom(roomId, room, msPeer, protooPeer);
					logProtooInfo("peer connected", { roomId, peerId, conn: msPeer.connectionId?.slice(0, 8) });
				} catch (err) {
					logProtooError("connection failed", (err as Error)?.message || err);
					reject(500, protooErrorReason(EasymeetErrorCode.CONNECTION_FAILED, String((err as Error)?.message || err)));
				}
			})();
		} catch (e) {
			reject(500, protooErrorReason(EasymeetErrorCode.CONNECTION_FAILED, String((e as Error)?.message || e)));
		}
	});

	return protooWss;
}
