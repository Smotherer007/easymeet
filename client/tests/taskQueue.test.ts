import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TaskQueue } from "../src/utils/taskQueue.ts";

describe("TaskQueue", () => {
	it("runs tasks sequentially", async () => {
		const q = new TaskQueue();
		const order: number[] = [];

		await Promise.all([
			q.push(async () => {
				order.push(1);
			}),
			q.push(async () => {
				await new Promise((r) => setTimeout(r, 10));
				order.push(2);
			}),
			q.push(async () => {
				order.push(3);
			}),
		]);

		assert.deepEqual(order, [1, 2, 3]);
	});

	it("returns task result", async () => {
		const q = new TaskQueue();
		const result = await q.push(async () => 42);
		assert.equal(result, 42);
	});

	it("propagates errors", async () => {
		const q = new TaskQueue();
		await assert.rejects(
			q.push(async () => {
				throw new Error("boom");
			})
		);
	});

	it("continues after error", async () => {
		const q = new TaskQueue();
		const order: number[] = [];

		q.push(async () => {
			throw new Error("fail");
		}).catch(() => {});
		await q.push(async () => {
			order.push(1);
		});

		assert.deepEqual(order, [1]);
	});
});
