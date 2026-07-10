import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeClientId, getRequestClientId } from "../src/authz.ts";
import type { Request } from "express";

describe("sanitizeClientId", () => {
	it("accepts valid client IDs", () => {
		const id = "client-abcdef12345678";
		assert.equal(sanitizeClientId(id), id);
	});

	it("rejects too short IDs", () => {
		assert.equal(sanitizeClientId("abc"), "");
	});

	it("rejects IDs with invalid characters", () => {
		assert.equal(sanitizeClientId("client@bad!"), "");
	});

	it("slices IDs over 128 chars to valid length", () => {
		const long = "a".repeat(129) + "12345678";
		const result = sanitizeClientId(long);
		assert.equal(result.length, 128);
	});

	it("returns empty for non-string input", () => {
		assert.equal(sanitizeClientId(null as unknown as string), "");
		assert.equal(sanitizeClientId(undefined as unknown as string), "");
	});
});

describe("getRequestClientId", () => {
	it("reads from x-easymeet-client-id header", () => {
		const req = {
			headers: { "x-easymeet-client-id": "client-abcdef12345678" },
			query: {},
		} as unknown as Request;
		assert.equal(getRequestClientId(req), "client-abcdef12345678");
	});

	it("falls back to query clientId", () => {
		const req = {
			headers: {},
			query: { clientId: "queryid-12345678901234" },
		} as unknown as Request;
		assert.equal(getRequestClientId(req), "queryid-12345678901234");
	});

	it("returns empty when no valid ID found", () => {
		const req = {
			headers: {},
			query: {},
		} as unknown as Request;
		assert.equal(getRequestClientId(req), "");
	});
});
