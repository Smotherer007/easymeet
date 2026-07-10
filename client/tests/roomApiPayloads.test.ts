import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	parseCreateRoomBody,
	parseRegisterHostBody,
	parseJoinBody,
} from "../src/shared/roomApiPayloads.ts";

describe("parseCreateRoomBody", () => {
	it("parses valid body", () => {
		const r = parseCreateRoomBody({ password: "secret", roomCode: "ROOM1" });
		assert.equal(r.ok, true);
		if (r.ok) {
			assert.equal(r.data.password, "secret");
			assert.equal(r.data.roomCode, "ROOM1");
		}
	});

	it("rejects null", () => {
		assert.equal(parseCreateRoomBody(null).ok, false);
	});

	it("defaults missing fields to empty", () => {
		const r = parseCreateRoomBody({});
		assert.equal(r.ok, true);
		if (r.ok) {
			assert.equal(r.data.password, "");
			assert.equal(r.data.roomCode, "");
		}
	});
});

describe("parseRegisterHostBody", () => {
	it("parses valid body", () => {
		const r = parseRegisterHostBody({ hostPeerId: "p1", hostSetupToken: "t1" });
		assert.equal(r.ok, true);
	});

	it("rejects missing hostPeerId", () => {
		assert.equal(parseRegisterHostBody({ hostSetupToken: "t" }).ok, false);
	});

	it("rejects missing hostSetupToken", () => {
		assert.equal(parseRegisterHostBody({ hostPeerId: "p" }).ok, false);
	});
});

describe("parseJoinBody", () => {
	it("parses with identifier field", () => {
		const r = parseJoinBody({ identifier: "ROOM1" });
		assert.equal(r.ok, true);
		if (r.ok) assert.equal(r.data.identifier, "ROOM1");
	});

	it("parses with roomId field", () => {
		const r = parseJoinBody({ roomId: "ROOM2" });
		assert.equal(r.ok, true);
		if (r.ok) assert.equal(r.data.identifier, "ROOM2");
	});

	it("falls back to route param", () => {
		const r = parseJoinBody({}, "ROOM3");
		assert.equal(r.ok, true);
		if (r.ok) assert.equal(r.data.identifier, "ROOM3");
	});

	it("rejects without identifier", () => {
		assert.equal(parseJoinBody({}).ok, false);
	});
});
