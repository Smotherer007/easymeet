import * as mediasoup from "mediasoup";
import { normalizeRoomCode } from "../roomCode.ts";
import {
	workerSettings,
	mediaCodecs,
	numWorkers,
	webRtcTransportOptions,
} from "./config.ts";
import {
	logMediasoupInfo,
	logMediasoupWarn,
	logMediasoupError,
} from "../logger.ts";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Room: ProtooRoom } = require("protoo-server") as { Room: new () => import("protoo-server").Room };

const workers: mediasoup.types.Worker[] = [];
let nextWorkerIdx = 0;

const msRooms = new Map<string, RoomState>();

export interface PeerState {
	peerId: string;
	nick: string;
	protooPeer: import("protoo-server").Peer | null;
	joined: boolean;
	rtpCapabilities: object | null;
	sctpCapabilities: object | null;
	transports: Map<string, mediasoup.types.Transport>;
	producers: Map<string, mediasoup.types.Producer>;
	consumers: Map<string, mediasoup.types.Consumer>;
	muted: boolean;
	videoEnabled: boolean;
	backgroundEffect: string;
	handRaised: boolean;
	spamState: { windowStart: number; chatCount: number; fileChunkCount: number } | null;
	clientId?: string;
	connectionId?: string;
}

export interface RoomState {
	router: mediasoup.types.Router;
	peers: Map<string, PeerState>;
	protooRoom: import("protoo-server").Room;
	createdAt: number;
	polls: Map<string, Poll>;
	pollSeq: number;
	chatHistory: ChatEntry[];
	canonicalRoomId?: string;
}

export interface Poll {
	id: string;
	question: string;
	options: string[];
	votes: Map<string, number | number[]>;
	creatorPeerId: string;
	closed: boolean;
}

export type ChatEntry =
	| { type: "chat"; nick: string; text: string; ts: number; giphyUrls: string[] }
	| { type: "file_share"; nick: string; filename: string; ts: number; fileId: string; mimeType: string };

const MAX_ROOM_CHAT_HISTORY = 400;

export function appendRoomChatEntry(room: { chatHistory?: ChatEntry[] }, entry: ChatEntry): void {
	if (!room.chatHistory) room.chatHistory = [];
	room.chatHistory.push(entry);
	if (room.chatHistory.length > MAX_ROOM_CHAT_HISTORY) {
		room.chatHistory.splice(0, room.chatHistory.length - MAX_ROOM_CHAT_HISTORY);
	}
}

export function getChatHistorySnapshot(room: { chatHistory?: ChatEntry[] }): ChatEntry[] {
	return room.chatHistory?.length ? [...room.chatHistory] : [];
}

export async function createWorkers(): Promise<void> {
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
		logMediasoupWarn(
			"MEDIASOUP_ANNOUNCED_IP is not set — remote clients (other device, Docker) often get no RTP."
		);
	}
}

function getNextWorker(): mediasoup.types.Worker {
	const worker = workers[nextWorkerIdx];
	nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
	return worker;
}

function canonicalRoomId(roomId: string): string {
	return normalizeRoomCode(roomId);
}

export async function getOrCreateRoom(roomId: string): Promise<RoomState> {
	const id = canonicalRoomId(roomId);
	if (!id) throw new Error("invalid roomId");
	if (msRooms.has(id)) return msRooms.get(id)!;
	const worker = getNextWorker();
	const router = await worker.createRouter({ mediaCodecs: mediaCodecs as mediasoup.types.RtpCodecCapability[] });
	const room: RoomState = {
		router,
		peers: new Map(),
		protooRoom: new ProtooRoom(),
		createdAt: Date.now(),
		polls: new Map(),
		pollSeq: 0,
		chatHistory: [],
		canonicalRoomId: id,
	};
	msRooms.set(id, room);
	logMediasoupInfo("router created", { roomId: id });
	return room;
}

export function getRoom(roomId: string): RoomState | null {
	const id = canonicalRoomId(roomId);
	if (!id) return null;
	return msRooms.get(id) ?? null;
}

export function deleteRoom(roomId: string): void {
	const id = canonicalRoomId(roomId);
	if (!id) return;
	const room = msRooms.get(id);
	if (!room) return;
	const ids = [...room.peers.keys()];
	for (const pid of ids) cleanupMediasoupPeerResources(room, pid);
	try {
		room.protooRoom?.close();
	} catch {
		/* ignore */
	}
	room.router.close();
	msRooms.delete(id);
	logMediasoupInfo("room closed", { roomId: id });
}

export function cleanupMediasoupPeerResources(room: RoomState, peerId: string): void {
	const peer = room.peers.get(peerId);
	if (!peer) return;
	peer.consumers.forEach((c) => {
		try { c.close(); } catch { /* ignore */ }
	});
	peer.consumers.clear();
	peer.producers.forEach((p) => {
		try { p.close(); } catch { /* ignore */ }
	});
	peer.producers.clear();
	peer.transports.forEach((t) => {
		try { t.close(); } catch { /* ignore */ }
	});
	peer.transports.clear();
	room.peers.delete(peerId);
}

export function createPeerState(peerId: string, nick: string): PeerState {
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
		backgroundEffect: "none",
		handRaised: false,
		spamState: null,
	};
}

export interface WebRtcTransportOptions {
	direction?: "producer" | "consumer";
	sctpCapabilities?: { numStreams?: { OS: number; MIS: number } };
	forceTcp?: boolean;
}

export interface WebRtcTransportInfo {
	id: string;
	iceParameters: mediasoup.types.IceParameters;
	iceCandidates: mediasoup.types.IceCandidate[];
	dtlsParameters: mediasoup.types.DtlsParameters;
	sctpParameters?: mediasoup.types.SctpParameters;
}

export async function createWebRtcTransport(
	roomId: string,
	peerId: string,
	options: WebRtcTransportOptions = {}
): Promise<WebRtcTransportInfo | null> {
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
		numSctpStreams: sctpCapabilities?.numStreams ?? webRtcTransportOptions.numSctpStreams,
	});

	transport.appData = { direction };
	peer.transports.set(transport.id, transport);

	return {
		id: transport.id,
		iceParameters: transport.iceParameters,
		iceCandidates: transport.iceCandidates,
		dtlsParameters: transport.dtlsParameters,
		sctpParameters: transport.sctpParameters,
	};
}

export interface ClosePeerOptions {
	closeProtooPeer?: boolean;
}

export function closePeer(
	roomId: string,
	peerId: string,
	opts: ClosePeerOptions = {}
): { nick: string } {
	const { closeProtooPeer = true } = opts;
	const id = canonicalRoomId(roomId);
	if (!id) return { nick: "?" };
	const room = msRooms.get(id);
	if (!room) return { nick: "?" };
	const peer = room.peers.get(peerId);
	const nick = peer?.nick ?? "?";

	cleanupMediasoupPeerResources(room, peerId);

	if (closeProtooPeer && room.protooRoom?.hasPeer(peerId)) {
		try {
			const pp = room.protooRoom.getPeer(peerId);
			if (pp && !pp.closed) pp.close();
		} catch {
			/* ignore */
		}
	}

	if (room.peers.size === 0) {
		try { room.protooRoom?.close(); } catch { /* ignore */ }
		room.router.close();
		msRooms.delete(id);
	}

	return { nick };
}

export function getRouterRtpCapabilities(roomId: string): mediasoup.types.RtpCapabilities | null {
	const room = getRoom(roomId);
	return room ? room.router.rtpCapabilities : null;
}

export interface PeerInfo {
	peerId: string;
	nick: string;
	muted: boolean;
	videoEnabled: boolean;
	backgroundEffect: string;
}

export function getRoomPeers(roomId: string): PeerInfo[] {
	const room = getRoom(roomId);
	if (!room) return [];
	return Array.from(room.peers.values()).map((p) => ({
		peerId: p.peerId,
		nick: p.nick,
		muted: p.muted,
		videoEnabled: p.videoEnabled,
		backgroundEffect: p.backgroundEffect,
	}));
}

export function countJoinedPeers(room: RoomState | null): number {
	if (!room?.peers) return 0;
	let n = 0;
	for (const p of room.peers.values()) {
		if (p.joined) n += 1;
	}
	return n;
}

export function listRoomParticipantNicks(room: RoomState | null): string[] {
	if (!room?.peers) return [];
	const nicks = Array.from(room.peers.values())
		.filter((p) => p.joined)
		.map((p) => String(p.nick || "").trim())
		.filter((n) => n.length > 0);
	nicks.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
	return nicks;
}

export interface ActiveRoom {
	roomId: string;
	participantCount: number;
	participants: string[];
}

export function listActiveRoomsPublic(): ActiveRoom[] {
	const out: ActiveRoom[] = [];
	for (const [roomId, room] of msRooms.entries()) {
		const participantCount = countJoinedPeers(room);
		if (participantCount < 1) continue;
		out.push({
			roomId,
			participantCount,
			participants: listRoomParticipantNicks(room),
		});
	}
	out.sort((a, b) => a.roomId.localeCompare(b.roomId));
	return out;
}
