import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EasymeetErrorCode, jsonErrorBody, protooErrorReason } from "../src/easymeetErrors.ts";

describe("easymeetErrors", () => {
	describe("jsonErrorBody", () => {
		it("returns code and message", () => {
			const body = jsonErrorBody("TEST_CODE", "Test message");
			assert.equal(body.code, "TEST_CODE");
			assert.equal(body.message, "Test message");
		});
	});

	describe("protooErrorReason", () => {
		it("formats with [CODE] prefix", () => {
			assert.equal(protooErrorReason("ERR", "Something wrong"), "[ERR] Something wrong");
		});
	});

	describe("EasymeetErrorCode", () => {
		it("has expected error codes", () => {
			assert.equal(EasymeetErrorCode.ROOM_NOT_FOUND, "ROOM_NOT_FOUND");
			assert.equal(EasymeetErrorCode.INVALID_PASSWORD, "INVALID_PASSWORD");
			assert.equal(EasymeetErrorCode.INTERNAL_ERROR, "INTERNAL_ERROR");
		});
	});
});
