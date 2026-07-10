import crypto from "node:crypto";

type TokenRecord = {
	roomId: string;
	peerId: string;
	clientId: string;
	expires: number;
};

const pending = new Map<string, TokenRecord>();

const TTL_MS = 10 * 60 * 1000;

function sweep(): void {
	const now = Date.now();
	for (const [k, v] of pending.entries()) {
		if (v.expires < now) pending.delete(k);
	}
}

setInterval(() => sweep(), 60_000).unref?.();

export function issueHandshakeToken(roomIdNorm: string, peerId: string, clientId = ""): string {
	sweep();
	const wsToken = crypto.randomBytes(32).toString("hex");
	pending.set(wsToken, { roomId: roomIdNorm, peerId, clientId, expires: Date.now() + TTL_MS });
	return wsToken;
}

export function consumeHandshakeToken(token: string | null): { roomId: string; peerId: string; clientId: string } | null {
	if (!token || typeof token !== "string" || token.length < 64) return null;
	sweep();
	const rec = pending.get(token);
	if (!rec || rec.expires < Date.now()) {
		if (rec) pending.delete(token);
		return null;
	}
	pending.delete(token);
	return { roomId: rec.roomId, peerId: rec.peerId, clientId: rec.clientId };
}

export function newAssignedPeerId(): string {
	return crypto.randomBytes(16).toString("hex");
}
