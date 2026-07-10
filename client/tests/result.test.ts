import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ok, err, flatMap, map } from "../src/shared/result.ts";

describe("Result (ok/err)", () => {
	it("ok returns success", () => {
		const r = ok(42);
		assert.equal(r.success, true);
		assert.equal(r.data, 42);
	});

	it("err returns failure with code", () => {
		const r = err("TEST", "msg", { detail: 1 });
		assert.equal(r.success, false);
		assert.equal(r.error.code, "TEST");
		assert.equal(r.error.message, "msg");
		assert.deepEqual(r.error.details, { detail: 1 });
	});

	it("flatMap chains success", () => {
		const r = flatMap(ok("hello"), (s) => ok(s.length));
		assert.equal(r.success, true);
		assert.equal(r.data, 5);
	});

	it("flatMap short-circuits on error", () => {
		const e = err("FAIL", "nope");
		const r = flatMap(e, () => ok(1) as any);
		assert.equal(r.success, false);
		assert.equal(r.error.code, "FAIL");
	});

	it("map transforms success", () => {
		const r = map(ok(3), (n) => n * 2);
		assert.equal(r.success, true);
		assert.equal(r.data, 6);
	});

	it("map passes through error", () => {
		const e = err("ERR", "bad");
		const r = map(e, (x: any) => x);
		assert.equal(r.success, false);
	});
});
