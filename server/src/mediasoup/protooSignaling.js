/**
 * Protoo signaling like mediasoup-demo (server-driven consumers + newConsumer request).
 * Easymeet extensions: "easymeet" notification with { type, ... } (chat, files, …).
 *
 * Flows follow versatica/mediasoup-demo (ISC).
 */

import { createRequire } from "module";
import { randomUUID } from "node:crypto";
import { normalizeRoomCode } from "../roomCode.js";
import {
	getOrCreateRoom,
	getRoom,
	closePeer,
	createPeerState,
	createWebRtcTransport,
	cleanupMediasoupPeerResources,
	appendRoomChatEntry,
	getChatHistorySnapshot
} from "./rooms.js";
import { logProtooInfo, logProtooWarn, logProtooError, runWithLogContextAsync } from "../logger.js";
import { consumeHandshakeToken } from "../wsJoinTokens.js";
import { EasymeetErrorCode, protooErrorReason } from "../easymeetErrors.js";

const require = createRequire(import.meta.url);
const { WebSocketServer: ProtooWebSocketServer } = require("protoo-server");

function buildMembersList(room) {
	return Array.from(room.peers.values())
		.filter((p) => p.joined)
		.map((p) => ({
			peerId: p.peerId,
			nick: p.nick,
			muted: p.muted,
			videoEnabled: p.videoEnabled,
			backgroundEffect: p.backgroundEffect,
			handRaised: !!p.handRaised
		}));
}

function sanitizeReactionEmoji(raw) {
	if (typeof raw !== "string") return "";
	const s = raw.trim().slice(0, 16);
	if (!s || /[<>]/.test(s) || /[{}\u0000-\u001f]/.test(s)) return "";
	return s;
}

function sanitizeGiphyUrls(raw) {
	if (!Array.isArray(raw)) return [];
	const out = [];
	for (const u of raw) {
		if (typeof u !== "string") continue;
		const s = u.trim().slice(0, 2048);
		if (!s || !/^https?:\/\//i.test(s)) continue;
		out.push(s);
		if (out.length >= 10) break;
	}
	return out;
}

/**
 * Client-/History-Form (ohne peerId), wie der Client in `chat/messageReceived` erwartet.
 * @returns {{ type: 'chat'; nick: string; text: string; ts: number; giphyUrls: string[] } | null}
 */
function buildSanitizedChatClientEntry(msg, msPeer) {
	const nick = typeof msg.nick === "string" ? msg.nick.trim().slice(0, 128) : msPeer.nick || "?";
	const text = typeof msg.text === "string" ? msg.text.slice(0, 4000) : "";
	const ts = Number(msg.ts) || Date.now();
	const giphyUrls = sanitizeGiphyUrls(msg.giphyUrls);
	if (!text.trim() && !giphyUrls.length) return null;
	return { type: "chat", nick, text, ts, giphyUrls };
}

/**
 * @returns {{ type: 'file_share'; nick: string; filename: string; ts: number; fileId: string } | null}
 */
function buildSanitizedFileShareClientEntry(msg, msPeer) {
	const nick = typeof msg.nick === "string" ? msg.nick.trim().slice(0, 128) : msPeer.nick || "?";
	const filename = typeof msg.filename === "string" ? msg.filename.trim().slice(0, 256) : "";
	const fileId = typeof msg.fileId === "string" ? msg.fileId.trim().slice(0, 128) : "";
	const ts = Number(msg.ts) || Date.now();
	if (!filename || !fileId) return null;
	return { type: "file_share", nick, filename, ts, fileId };
}

function serializePollPublic(poll) {
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
		creatorPeerId: poll.creatorPeerId
	};
}

function getPollsSnapshot(room) {
	if (!room.polls?.size) return [];
	return [...room.polls.values()].map(serializePollPublic);
}

function serializeProtoPeer(msPeer) {
	return {
		peerId: msPeer.peerId,
		displayName: msPeer.nick,
		device: { flag: "easymeet", name: "Easymeet" }
	};
}

function getConsumerTransport(msPeer) {
	for (const t of msPeer.transports.values()) {
		if (t.appData?.direction === "consumer") return t;
	}
	return null;
}

/**
 * Protoo: Peer.notify ist async — „transport closed“ landet als rejected Promise, nicht in try/catch.
 */
function safeProtooNotify(protooPeer, method, data) {
	if (!protooPeer) return;
	Promise.resolve(protooPeer.notify(method, data)).catch(() => {});
}

function broadcastEasymeet(roomId, payload, excludePeerId = null) {
	const room = getRoom(roomId);
	if (!room) return;
	for (const p of room.peers.values()) {
		if (!p.joined || p.peerId === excludePeerId) continue;
		safeProtooNotify(p.protooPeer, "easymeet", payload);
	}
}

/**
 * @param {import('./rooms.js').PeerState} consumerPeer
 * @param {import('mediasoup').types.Producer} producer
 * @param {import('./rooms.js').RoomState} room
 */
async function consumeProducerForPeer(consumerPeer, producer, room) {
	const transport = getConsumerTransport(consumerPeer);
	if (!transport) return;
	if (!consumerPeer.joined || !consumerPeer.rtpCapabilities) return;

	if (
		!room.router.canConsume({
			producerId: producer.id,
			rtpCapabilities: consumerPeer.rtpCapabilities
		})
	) {
		logProtooWarn("canConsume false", {
			peerId: consumerPeer.peerId,
			producerId: producer.id,
			kind: producer.kind
		});
		return;
	}

	let consumer;
	try {
		consumer = await transport.consume({
			producerId: producer.id,
			rtpCapabilities: consumerPeer.rtpCapabilities,
			enableRtx: true,
			/* paused: true + sofort resume() traf nach schnellem Producer-Neuaufbau (z. B. Hintergrundwechsel) in
			 * mediasoup gelegentlich „Channel request handler … not found“ beim resume — Client ist nach newConsumer bereit. */
			paused: false,
			ignoreDtx: true,
			appData: {
				peerId: producer.appData.peerId,
				source: producer.appData.source || "mic"
			}
		});
	} catch (err) {
		logProtooWarn("consumeProducerForPeer failed", err?.message || err);
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
			appData: consumer.appData
		});
	} catch (err) {
		logProtooWarn("newConsumer request failed", err?.message || err);
		try {
			consumer.close();
		} catch (_) {}
		consumerPeer.consumers.delete(consumer.id);
	}
}

async function notifyExistingProducersToNewPeer(room, joiningPeer) {
	for (const other of room.peers.values()) {
		if (other.peerId === joiningPeer.peerId || !other.joined) continue;
		for (const producer of other.producers.values()) {
			await consumeProducerForPeer(joiningPeer, producer, room);
		}
	}
}

async function notifyNewProducerToOthers(room, producingPeerId, producer) {
	for (const other of room.peers.values()) {
		if (other.peerId === producingPeerId || !other.joined) continue;
		await consumeProducerForPeer(other, producer, room);
	}
}

function attachPeerToRoom(roomId, room, msPeer, protooPeer) {
	msPeer.protooPeer = protooPeer;

	protooPeer.on("close", () => {
		const roomNow = getRoom(roomId);
		if (!roomNow) return;
		const still = roomNow.peers.get(msPeer.peerId);
		if (!still) return;
		const nick = still.nick ?? "?";
		const leftId = msPeer.peerId;

		/* Abgehender Peer noch in room.peers — nicht an seinen geschlossenen Transport notify-en */
		broadcastEasymeet(roomId, { type: "peer_left", peerId: leftId, nick }, leftId);

		closePeer(roomId, leftId, { closeProtooPeer: false });

		const roomAfter = getRoom(roomId);
		if (roomAfter) {
			broadcastEasymeet(roomId, { type: "members_updated", members: buildMembersList(roomAfter) }, null);
		}
	});

	protooPeer.on("request", async (request, accept, reject) => {
		try {
			await runWithLogContextAsync(
				{
					connectionId: msPeer.connectionId,
					roomId,
					peerId: msPeer.peerId
				},
				async () => {
					await handleProtooRequest(roomId, room, msPeer, request, accept, reject);
				}
			);
		} catch (err) {
			logProtooError("request error", request.method, err?.message || err);
			reject(err instanceof Error ? err : new Error(String(err)));
		}
	});

	protooPeer.on("notification", (notification) => {
		handleProtooNotification(roomId, room, msPeer, notification).catch((e) => {
			logProtooWarn("notification error", notification.method, e?.message || e);
		});
	});
}

async function handleProtooRequest(roomId, room, msPeer, request, accept, reject) {
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
			const { displayName, device: _device, rtpCapabilities, sctpCapabilities, easymeet } = data;

			msPeer.nick = displayName || msPeer.nick || "?";
			msPeer.rtpCapabilities = rtpCapabilities ?? null;
			msPeer.sctpCapabilities = sctpCapabilities ?? null;
			msPeer.joined = true;

			if (easymeet && typeof easymeet === "object") {
				if (easymeet.muted !== undefined) msPeer.muted = easymeet.muted;
				if (easymeet.videoEnabled !== undefined) msPeer.videoEnabled = easymeet.videoEnabled;
				if (easymeet.backgroundEffect !== undefined) {
					msPeer.backgroundEffect = easymeet.backgroundEffect ?? "none";
				}
			}

			const otherPeers = Array.from(room.peers.values()).filter((p) => p.peerId !== msPeer.peerId && p.joined);

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
					handRaised: !!msPeer.handRaised
				},
				msPeer.peerId
			);

			const peersPayload = otherPeers.map((p) => serializeProtoPeer(p));
			accept({
				peers: peersPayload,
				easymeetPolls: getPollsSnapshot(room),
				easymeetChatHistory: getChatHistorySnapshot(room)
			});

			await notifyExistingProducersToNewPeer(room, msPeer);

			const members = buildMembersList(room);
			broadcastEasymeet(roomId, { type: "members_updated", members }, null);
			break;
		}

		case "createWebRtcTransport": {
			const { sctpCapabilities, forceTcp, appData } = data;
			const direction = appData?.direction === "consumer" ? "consumer" : "producer";
			const info = await createWebRtcTransport(roomId, msPeer.peerId, {
				direction,
				sctpCapabilities,
				forceTcp: !!forceTcp
			});
			if (!info) {
				reject(
					new Error(
						protooErrorReason(EasymeetErrorCode.TRANSPORT_CREATE_FAILED, "createWebRtcTransport failed")
					)
				);
				return;
			}
			accept({
				transportId: info.id,
				iceParameters: info.iceParameters,
				iceCandidates: info.iceCandidates,
				dtlsParameters: info.dtlsParameters,
				sctpParameters: info.sctpParameters
			});
			break;
		}

		case "connectWebRtcTransport": {
			const { transportId, dtlsParameters } = data;
			const transport = msPeer.transports.get(transportId);
			if (!transport) {
				reject(new Error(protooErrorReason(EasymeetErrorCode.TRANSPORT_NOT_FOUND, "transport not found")));
				return;
			}
			await transport.connect({ dtlsParameters });
			accept();
			break;
		}

		case "restartIce": {
			const { transportId } = data;
			const transport = msPeer.transports.get(transportId);
			if (!transport) {
				reject(new Error(protooErrorReason(EasymeetErrorCode.TRANSPORT_NOT_FOUND, "transport not found")));
				return;
			}
			const iceParameters = await transport.restartIce();
			accept({ iceParameters });
			break;
		}

		case "produce": {
			if (!msPeer.joined) {
				reject(new Error(protooErrorReason(EasymeetErrorCode.NOT_JOINED, "not joined")));
				return;
			}
			const { transportId, kind, rtpParameters, appData } = data;
			const transport = msPeer.transports.get(transportId);
			if (!transport) {
				reject(new Error(protooErrorReason(EasymeetErrorCode.TRANSPORT_NOT_FOUND, "transport not found")));
				return;
			}

			const incomingSource = appData?.source || "mic";
			/* Race: produceLocalTracks + updateLocalStream can briefly create two webcam producers → duplicate video consumers / black tile */
			if (kind === "video" && (incomingSource === "video" || incomingSource === "cam")) {
				for (const [existingId, existingProducer] of [...msPeer.producers.entries()]) {
					const src = existingProducer.appData?.source;
					if (existingProducer.kind === "video" && (src === "video" || src === "cam")) {
						try {
							existingProducer.close();
						} catch (_) {}
						msPeer.producers.delete(existingId);
					}
				}
			}

			const producer = await transport.produce({
				kind,
				rtpParameters,
				enableMediasoupPacketIdHeaderExtension: true,
				appData: {
					...(appData || {}),
					peerId: msPeer.peerId,
					source: appData?.source || "mic"
				}
			});

			msPeer.producers.set(producer.id, producer);
			producer.on("transportclose", () => msPeer.producers.delete(producer.id));

			accept({ producerId: producer.id });

			await notifyNewProducerToOthers(room, msPeer.peerId, producer);
			break;
		}

		default:
			reject(
				new Error(
					protooErrorReason(
						EasymeetErrorCode.UNKNOWN_PROTOO_METHOD,
						`unknown method "${method}"`
					)
				)
			);
	}
}

async function handleProtooNotification(roomId, room, msPeer, notification) {
	const { method, data } = notification;

	switch (method) {
		case "closeProducer": {
			const producer = msPeer.producers.get(data.producerId);
			if (producer) {
				producer.close();
				msPeer.producers.delete(data.producerId);
			}
			break;
		}

		case "pauseProducer": {
			const producer = msPeer.producers.get(data.producerId);
			if (producer) await producer.pause();
			break;
		}

		case "resumeProducer": {
			const producer = msPeer.producers.get(data.producerId);
			if (producer) await producer.resume();
			break;
		}

		case "pauseConsumer": {
			const consumer = msPeer.consumers.get(data.consumerId);
			if (consumer) await consumer.pause();
			break;
		}

		case "resumeConsumer": {
			const consumer = msPeer.consumers.get(data.consumerId);
			/* Consumer oft mit paused:false erzeugt — erneutes resume() trifft im Worker „handler not found“. */
			if (consumer && consumer.paused && !consumer.closed) {
				try {
					await consumer.resume();
				} catch (e) {
					logProtooWarn("resumeConsumer", e?.message || e);
				}
			}
			break;
		}

		case "easymeet": {
			const msg = data;
			if (!msg?.type) return;

			switch (msg.type) {
				case "chat": {
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
					msPeer.muted = msg.muted ?? msPeer.muted;
					broadcastEasymeet(roomId, { type: "mute", peerId: msPeer.peerId, muted: msg.muted }, msPeer.peerId);
					broadcastEasymeet(roomId, { type: "members_updated", members: buildMembersList(room) }, null);
					break;

				case "video":
					msPeer.videoEnabled = msg.videoEnabled ?? msPeer.videoEnabled;
					broadcastEasymeet(roomId, { type: "video", peerId: msPeer.peerId, videoEnabled: msg.videoEnabled }, msPeer.peerId);
					broadcastEasymeet(roomId, { type: "members_updated", members: buildMembersList(room) }, null);
					break;

				case "background_effect":
					msPeer.backgroundEffect = msg.effect ?? "none";
					broadcastEasymeet(
						roomId,
						{
							type: "background_effect",
							peerId: msPeer.peerId,
							effect: msg.effect || "none"
						},
						msPeer.peerId
					);
					break;

				case "screen_stream":
					broadcastEasymeet(
						roomId,
						{
							type: "screen_stream",
							peerId: msPeer.peerId,
							nick: msg.nick ?? msPeer.nick
						},
						msPeer.peerId
					);
					break;

				case "screen_sharing_stopped":
					broadcastEasymeet(roomId, { type: "screen_sharing_stopped", peerId: msPeer.peerId }, msPeer.peerId);
					break;

				case "file_start":
				case "file_end":
				case "file_chunk":
					broadcastEasymeet(roomId, msg, msPeer.peerId);
					break;

				case "reaction": {
					const emoji = sanitizeReactionEmoji(msg.emoji);
					if (!emoji) break;
					broadcastEasymeet(roomId, { type: "reaction", peerId: msPeer.peerId, emoji, ts: Date.now() }, null);
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
					const q = typeof msg.question === "string" ? msg.question.trim().slice(0, 200) : "";
					const rawOpts = Array.isArray(msg.options) ? msg.options : [];
					const opts = rawOpts.map((o) => String(o).trim().slice(0, 80)).filter(Boolean);
					if (q.length < 1 || opts.length < 2 || opts.length > 8) break;
					room.pollSeq = (room.pollSeq || 0) + 1;
					const pollId = `p${room.pollSeq}_${randomUUID().slice(0, 8)}`;
					const poll = {
						id: pollId,
						question: q,
						options: opts,
						votes: new Map(),
						creatorPeerId: msPeer.peerId,
						closed: false
					};
					room.polls.set(pollId, poll);
					broadcastEasymeet(roomId, { type: "poll_created", poll: serializePollPublic(poll) }, null);
					break;
				}

				case "poll_vote": {
					const poll = room.polls?.get(msg.pollId);
					if (!poll || poll.closed) break;
					const idx = Number(msg.optionIndex);
					if (!Number.isInteger(idx) || idx < 0 || idx >= poll.options.length) break;
					poll.votes.set(msPeer.peerId, idx);
					broadcastEasymeet(roomId, { type: "poll_update", poll: serializePollPublic(poll) }, null);
					break;
				}

				case "poll_close": {
					const poll = room.polls?.get(msg.pollId);
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

/**
 * @param {import('http').Server} httpServer
 */
export function attachProtooToHttpServer(httpServer) {
	const protooWss = new ProtooWebSocketServer(httpServer, {
		maxReceivedFrameSize: 960000,
		maxReceivedMessageSize: 960000,
		fragmentOutgoingMessages: true,
		fragmentationThreshold: 960000
	});

	protooWss.on("connectionrequest", (info, accept, reject) => {
		try {
			const host = info.request.headers.host || "localhost";
			const u = new URL(info.request.url || "/", `http://${host}`);

			if (u.pathname !== "/ws") {
				logProtooWarn("connection rejected: not /ws", u.pathname);
				reject(404, protooErrorReason(EasymeetErrorCode.WS_PATH_NOT_FOUND, "Not Found"));
				return;
			}

			const token = u.searchParams.get("token");
			const consumed = consumeHandshakeToken(token);
			if (!consumed) {
				logProtooWarn("connection rejected: missing or invalid WebSocket token (join again)");
				reject(
					403,
					protooErrorReason(EasymeetErrorCode.WS_TOKEN_INVALID, "Invalid or expired WebSocket token")
				);
				return;
			}

			const roomId = normalizeRoomCode(consumed.roomId);
			const peerId = consumed.peerId;
			if (!roomId || !peerId) {
				logProtooWarn("connection rejected: invalid handshake payload");
				reject(400, protooErrorReason(EasymeetErrorCode.WS_HANDSHAKE_INVALID, "invalid handshake"));
				return;
			}

			const urlRoom = normalizeRoomCode(u.searchParams.get("roomId") || "");
			const urlPeer = (u.searchParams.get("peerId") || "").trim();
			if (urlRoom !== roomId || urlPeer !== peerId) {
				logProtooWarn("connection rejected: roomId/peerId mismatch vs token");
				reject(
					403,
					protooErrorReason(EasymeetErrorCode.WS_URL_TOKEN_MISMATCH, "WebSocket URL must match join response")
				);
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
					msPeer.connectionId = randomUUID();
					room.peers.set(peerId, msPeer);

					attachPeerToRoom(roomId, room, msPeer, protooPeer);
					logProtooInfo("peer connected", { roomId, peerId, conn: msPeer.connectionId?.slice(0, 8) });
				} catch (err) {
					logProtooError("connection failed", err?.message || err);
					reject(
						500,
						protooErrorReason(EasymeetErrorCode.CONNECTION_FAILED, String(err?.message || err))
					);
				}
			})();
		} catch (e) {
			reject(500, protooErrorReason(EasymeetErrorCode.CONNECTION_FAILED, String(e?.message || e)));
		}
	});

	return protooWss;
}
