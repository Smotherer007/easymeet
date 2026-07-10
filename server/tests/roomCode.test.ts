import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeRoomCode } from "../src/roomCode.ts";

describe("normalizeRoomCode", () => {
	it("uppercases and strips non-alphanumeric chars", () => {
		assert.equal(normalizeRoomCode("abc-123"), "ABC123");
		assert.equal(normalizeRoomCode("ABC 123"), "ABC123");
		assert.equal(normalizeRoomCode("a_b_c"), "ABC");
	});

	it("handles empty input", () => {
		assert.equal(normalizeRoomCode(""), "");
		assert.equal(normalizeRoomCode("   "), "");
	});

	it("handles lowercase input", () => {
		assert.equal(normalizeRoomCode("hello"), "HELLO");
	});

	it("preserves numbers", () => {
		assert.equal(normalizeRoomCode("room42"), "ROOM42");
	});
});
