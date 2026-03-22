/**
 * mediasoup room management.
 * Manages workers, routers, and peers per room.
 * One Protoo room (signaling) per mediasoup room — follows mediasoup-demo pattern.
 */

import * as mediasoup from "mediasoup";
import { createRequire } from "module";
import { normalizeRoomCode } from "../roomCode.js";
import { workerSettings, mediaCodecs, numWorkers, webRtcTransportOptions } from "./config.js";
import { logMediasoupInfo, logMediasoupWarn, logMediasoupError } from "../logger.js";

const require = createRequire(import.meta.url);
const { Room: ProtooRoom } = require("protoo-server");

/** @type {mediasoup.types.Worker[]} */
const workers = [];
let nextWorkerIdx = 0;

/** @type {Map<string, RoomState>} */
const msRooms = new Map();

/**
 * @typedef {Object} PeerState
 * @property {string} peerId
 * @property {string} nick
 * @property {import('protoo-server').Peer | null} protooPeer
 * @property {boolean} joined
 * @property {object|null} rtpCapabilities
 * @property {object|null} sctpCapabilities
 * @property {Map<string, mediasoup.types.Transport>} transports
 * @property {Map<string, mediasoup.types.Producer>} producers
 * @property {Map<string, mediasoup.types.Consumer>} consumers
 * @property {boolean} muted
 * @property {boolean} videoEnabled
 * @property {string} backgroundEffect
 */

/**
 * @typedef {Object} RoomState
 * @property {mediasoup.types.Router} router
 * @property {Map<string, PeerState>} peers
 * @property {import('protoo-server').Room} protooRoom
 * @property {number} createdAt
 */

export async function createWorkers() {
	for (let i = 0; i < numWorkers; i++) {
		const worker = await mediasoup.createWorker(workerSettings);
		worker.on("died", () => {
			logMediasoupError("worker died", { pid: worker.pid });
			setTimeout(() => process.exit(1), 2000);
		});
		workers.push(worker);
	}
	logMediasoupInfo(`${workers.length} worker(s) started`);
	if (!process.env.MEDIASOUP_ANNOUNCED_IP) {
		logMediasoupWarn("MEDIASOUP_ANNOUNCED_IP is not set — remote clients (other device, Docker) often get no RTP. See docker-compose / server docs.");
	}
}

function getNextWorker() {
	const worker = workers[nextWorkerIdx];
	nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
	return worker;
}

function canonicalRoomId(roomId) {
	return normalizeRoomCode(roomId);
}

export async function getOrCreateRoom(roomId) {
	const id = canonicalRoomId(roomId);
	if (!id) throw new Error("invalid roomId");
	if (msRooms.has(id)) return msRooms.get(id);
	const worker = getNextWorker();
	const router = await worker.createRouter({ mediaCodecs });
	const room = {
		router,
		peers: new Map(),
		protooRoom: new ProtooRoom(),
		createdAt: Date.now()
	};
	msRooms.set(id, room);
	logMediasoupInfo("router created", { roomId: id });
	return room;
}

export function getRoom(roomId) {
	const id = canonicalRoomId(roomId);
	if (!id) return null;
	return msRooms.get(id) ?? null;
}

export function deleteRoom(roomId) {
	const id = canonicalRoomId(roomId);
	if (!id) return;
	const room = msRooms.get(id);
	if (!room) return;
	const ids = [...room.peers.keys()];
	for (const pid of ids) cleanupMediasoupPeerResources(room, pid);
	try {
		room.protooRoom?.close();
	} catch (_) {}
	room.router.close();
	msRooms.delete(id);
	logMediasoupInfo("room closed", { roomId: id });
}

/**
 * mediasoup transports/producers/consumers only — does not close Protoo.
 */
export function cleanupMediasoupPeerResources(room, peerId) {
	const peer = room.peers.get(peerId);
	if (!peer) return;
	peer.consumers.forEach((c) => {
		try {
			c.close();
		} catch (_) {}
	});
	peer.consumers.clear();
	peer.producers.forEach((p) => {
		try {
			p.close();
		} catch (_) {}
	});
	peer.producers.clear();
	peer.transports.forEach((t) => {
		try {
			t.close();
		} catch (_) {}
	});
	peer.transports.clear();
	room.peers.delete(peerId);
}

export function createPeerState(peerId, nick) {
	return {
		peerId,
		nick: nick || "",
		protooPeer: null,
		joined: false,
		rtpCapabilities: null,
		sctpCapabilities: null,
		transports: new Map(),
		producers: new Map(),
		consumers: new Map(),
		muted: true,
		videoEnabled: false,
		backgroundEffect: "none"
	};
}

/**
 * @param {object} [options]
 * @param {'producer'|'consumer'} [options.direction]
 * @param {object} [options.sctpCapabilities]
 * @param {boolean} [options.forceTcp]
 */
export async function createWebRtcTransport(roomId, peerId, options = {}) {
	const { direction = "producer", sctpCapabilities, forceTcp = false } = options;

	const room = getRoom(roomId);
	if (!room) return null;
	const peer = room.peers.get(peerId);
	if (!peer) return null;

	const transport = await room.router.createWebRtcTransport({
		...webRtcTransportOptions,
		enableUdp: !forceTcp,
		enableTcp: true,
		enableSctp: Boolean(sctpCapabilities),
		numSctpStreams: sctpCapabilities?.numStreams ?? webRtcTransportOptions.numSctpStreams
	});

	transport.appData = { direction };
	peer.transports.set(transport.id, transport);

	return {
		id: transport.id,
		iceParameters: transport.iceParameters,
		iceCandidates: transport.iceCandidates,
		dtlsParameters: transport.dtlsParameters,
		sctpParameters: transport.sctpParameters
	};
}

/**
 * Close mediasoup peer; optionally Protoo peer (on reconnect Protoo may already be closed).
 * @param {object} [opts]
 * @param {boolean} [opts.closeProtooPeer]
 */
export function closePeer(roomId, peerId, opts = {}) {
	const { closeProtooPeer = true } = opts;
	const id = canonicalRoomId(roomId);
	if (!id) return;
	const room = msRooms.get(id);
	if (!room) return;
	const peer = room.peers.get(peerId);
	const nick = peer?.nick ?? "?";

	cleanupMediasoupPeerResources(room, peerId);

	if (closeProtooPeer && room.protooRoom?.hasPeer(peerId)) {
		try {
			const pp = room.protooRoom.getPeer(peerId);
			if (pp && !pp.closed) pp.close();
		} catch (_) {}
	}

	if (room.peers.size === 0) {
		try {
			room.protooRoom?.close();
		} catch (_) {}
		room.router.close();
		msRooms.delete(id);
	}

	return { nick };
}

export function getRouterRtpCapabilities(roomId) {
	const room = getRoom(roomId);
	return room ? room.router.rtpCapabilities : null;
}

export function getRoomPeers(roomId) {
	const room = getRoom(roomId);
	if (!room) return [];
	return Array.from(room.peers.values()).map((p) => ({
		peerId: p.peerId,
		nick: p.nick,
		muted: p.muted,
		videoEnabled: p.videoEnabled,
		backgroundEffect: p.backgroundEffect
	}));
}

/**
 * Display names of VoIP peers in a room (sorted, empty nicks omitted).
 * @param {RoomState|null} room
 * @returns {string[]}
 */
export function listRoomParticipantNicks(room) {
	if (!room?.peers) return [];
	const nicks = Array.from(room.peers.values())
		.map((p) => String(p.nick || "").trim())
		.filter((n) => n.length > 0);
	nicks.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
	return nicks;
}

/** Rooms with at least one connected peer (for public landing list). */
export function listActiveRoomsPublic() {
	const out = [];
	for (const [roomId, room] of msRooms.entries()) {
		const participantCount = room.peers.size;
		if (participantCount < 1) continue;
		out.push({
			roomId,
			participantCount,
			participants: listRoomParticipantNicks(room)
		});
	}
	out.sort((a, b) => a.roomId.localeCompare(b.roomId));
	return out;
}

const ROOM_TTL = 24 * 60 * 60 * 1000;
setInterval(
	() => {
		const now = Date.now();
		for (const [id, room] of msRooms.entries()) {
			if (now - room.createdAt > ROOM_TTL) deleteRoom(id);
		}
	},
	60 * 60 * 1000
);
