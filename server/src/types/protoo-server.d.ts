declare module "protoo-server" {
	import type { Duplex } from "node:stream";

	export class Room {
		hasPeer(peerId: string): boolean;
		getPeer(peerId: string): Peer;
		createPeer(peerId: string, transport: Duplex): Peer;
		close(): void;
	}

	export class Peer {
		notify(method: string, data: unknown): Promise<void>;
		request(method: string, data: unknown): Promise<unknown>;
		on(event: "close", cb: () => void): void;
		on(event: "request", cb: (request: { method: string; data: Record<string, unknown> }, accept: (payload?: unknown) => void, reject: (error?: unknown) => void) => void): void;
		on(event: "notification", cb: (notification: { method: string; data: Record<string, unknown> }) => void): void;
		close(): void;
		closed: boolean;
	}

	export class WebSocketServer {
		constructor(server: import("node:http").Server, opts?: Record<string, unknown>);
		on(event: "connectionrequest", cb: (info: { request: { url?: string; headers: Record<string, string | string[] | undefined> } }, accept: () => Duplex, reject: (code: number, reason: string) => void) => void): void;
	}

	export const version: string;
}
