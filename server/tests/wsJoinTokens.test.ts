import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { issueHandshakeToken, consumeHandshakeToken, newAssignedPeerId } from "../src/wsJoinTokens.ts";

describe("wsJoinTokens", () => {
	describe("newAssignedPeerId", () => {
		it("returns a 32-char hex string", () => {
			const id = newAssignedPeerId();
			assert.equal(id.length, 32);
			assert.match(id, /^[a-f0-9]+$/);
		});

		it("returns unique values", () => {
			const a = newAssignedPeerId();
			const b = newAssignedPeerId();
			assert.notEqual(a, b);
		});
	});

	describe("issueHandshakeToken / consumeHandshakeToken", () => {
		it("issues and consumes a token", () => {
			const token = issueHandshakeToken("ROOM1", "peer1", "client1");
			assert.equal(typeof token, "string");
			assert.equal(token.length, 64);

			const consumed = consumeHandshakeToken(token);
			assert.ok(consumed);
			assert.equal(consumed!.roomId, "ROOM1");
			assert.equal(consumed!.peerId, "peer1");
			assert.equal(consumed!.clientId, "client1");
		});

		it("returns null for consumed token", () => {
			const token = issueHandshakeToken("ROOM2", "peer2", "");
			consumeHandshakeToken(token);
			assert.equal(consumeHandshakeToken(token), null);
		});

		it("returns null for invalid token", () => {
			assert.equal(consumeHandshakeToken(null), null);
			assert.equal(consumeHandshakeToken("short"), null);
			assert.equal(consumeHandshakeToken(""), null);
		});
	});
});
