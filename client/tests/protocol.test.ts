import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	sanitizeEasymeetPayload,
	validateJoinMessage,
	validateChatMessage,
	validateMuteMessage,
} from "../src/protocol/validate.ts";

describe("sanitizeEasymeetPayload", () => {
	it("returns null for non-object", () => {
		assert.equal(sanitizeEasymeetPayload(null), null);
		assert.equal(sanitizeEasymeetPayload("string"), null);
		assert.equal(sanitizeEasymeetPayload([]), null);
	});

	it("returns null for missing type", () => {
		assert.equal(sanitizeEasymeetPayload({}), null);
	});

	it("sanitizes chat message", () => {
		const r = sanitizeEasymeetPayload({ type: "chat", nick: "Alice", text: "hello" });
		assert.ok(r);
		assert.equal(r!.type, "chat");
		assert.equal(r!.nick, "Alice");
	});

	it("sanitizes new_peer", () => {
		const r = sanitizeEasymeetPayload({ type: "new_peer", peerId: "abc", nick: "Bob" });
		assert.equal(r!.type, "new_peer");
	});

	it("caps long strings", () => {
		const long = "x".repeat(9000);
		const r = sanitizeEasymeetPayload({ type: "chat", nick: "Test", text: long });
		assert.ok(r);
		assert.ok((r!.text as string).length < 9000);
	});

	it("passes through unknown types", () => {
		const r = sanitizeEasymeetPayload({ type: "future_feature", data: "ok" });
		assert.ok(r);
		assert.equal(r!.type, "future_feature");
	});
});

describe("validateJoinMessage", () => {
	it("accepts valid join", () => {
		const r = validateJoinMessage({ type: "join", nick: "Alice" });
		assert.equal(r.success, true);
	});

	it("rejects missing nick", () => {
		const r = validateJoinMessage({ type: "join" });
		assert.equal(r.success, false);
	});

	it("rejects wrong type", () => {
		const r = validateJoinMessage({ type: "chat" });
		assert.equal(r.success, false);
	});
});

describe("validateChatMessage", () => {
	it("accepts valid chat", () => {
		const r = validateChatMessage({ type: "chat", nick: "Alice", text: "hi" });
		assert.equal(r.success, true);
	});

	it("defaults missing fields", () => {
		const r = validateChatMessage({ type: "chat" });
		assert.equal(r.success, true);
	});
});

describe("validateMuteMessage", () => {
	it("accepts valid mute", () => {
		const r = validateMuteMessage({ type: "mute", muted: true });
		assert.equal(r.success, true);
	});
});
