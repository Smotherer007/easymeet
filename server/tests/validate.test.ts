import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateCreateRoomPayload, validateRegisterHostPayload, validateJoinPayload } from "../src/validate.ts";

describe("validateCreateRoomPayload", () => {
	it("validates a valid payload", () => {
		const result = validateCreateRoomPayload({ password: "secret", roomCode: "ROOM1" });
		assert.ok(result.success);
		if (result.success) {
			assert.equal(result.data.password, "secret");
			assert.equal(result.data.roomCode, "ROOM1");
		}
	});

	it("fails on empty body", () => {
		const result = validateCreateRoomPayload(null);
		assert.equal(result.success, false);
	});

	it("fails on non-object body", () => {
		const result = validateCreateRoomPayload("string");
		assert.equal(result.success, false);
	});

	it("handles missing fields gracefully", () => {
		const result = validateCreateRoomPayload({});
		assert.ok(result.success);
		if (result.success) {
			assert.equal(result.data.password, "");
			assert.equal(result.data.roomCode, "");
		}
	});
});

describe("validateRegisterHostPayload", () => {
	it("validates a valid payload", () => {
		const result = validateRegisterHostPayload({
			hostPeerId: "peer123",
			hostSetupToken: "token456",
		});
		assert.ok(result.success);
	});

	it("fails without hostPeerId", () => {
		const result = validateRegisterHostPayload({
			hostSetupToken: "token456",
		});
		assert.equal(result.success, false);
	});

	it("fails without hostSetupToken", () => {
		const result = validateRegisterHostPayload({
			hostPeerId: "peer123",
		});
		assert.equal(result.success, false);
	});
});

describe("validateJoinPayload", () => {
	it("validates with identifier field", () => {
		const result = validateJoinPayload({ identifier: "ROOM1" });
		assert.ok(result.success);
		if (result.success) {
			assert.equal(result.data.identifier, "ROOM1");
			assert.equal(result.data.password, "");
		}
	});

	it("validates with roomId field", () => {
		const result = validateJoinPayload({ roomId: "ROOM2" });
		assert.ok(result.success);
		if (result.success) {
			assert.equal(result.data.identifier, "ROOM2");
		}
	});

	it("supports roomId from route param", () => {
		const result = validateJoinPayload({}, "ROOM3");
		assert.ok(result.success);
		if (result.success) {
			assert.equal(result.data.identifier, "ROOM3");
		}
	});

	it("fails without identifier", () => {
		const result = validateJoinPayload({});
		assert.equal(result.success, false);
	});
});
