import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRoomStore } from "../src/roomStore.ts";

describe("createRoomStore", () => {
	const store = createRoomStore();

	it("creates a store with a rooms map", () => {
		assert.ok(store.rooms instanceof Map);
	});

	it("finds no room for empty identifier", () => {
		assert.equal(store.findRoomByIdentifier(""), null);
	});

	it("allocates a random room id", () => {
		const id = store.allocateRoomId();
		assert.equal(id.length, 6);
		assert.match(id, /^[A-Z2-9]+$/);
	});

	it("allocates a preferred room id when available", () => {
		const id = store.allocateRoomId("TEST01");
		assert.equal(id, "TEST01");
	});

	it("finds room by identifier", () => {
		const roomId = store.allocateRoomId("FINDME");
		store.rooms.set(roomId, {
			passwordHash: "hash123",
			hostPeerId: null,
			createdAt: Date.now(),
		});

		const found = store.findRoomByIdentifier(roomId);
		assert.ok(found);
		assert.equal(found!.room.passwordHash, "hash123");
	});

	it("cleans up expired non-persistent rooms", () => {
		const oldStore = createRoomStore({ roomTtlMs: 1 });
		const id = oldStore.allocateRoomId("STALE1");
		// Wait for TTL to expire
		oldStore.cleanupExpiredRooms();
		assert.equal(oldStore.rooms.has(id), false);
	});

	it("does not clean up persistent rooms", () => {
		const store2 = createRoomStore({ roomTtlMs: 1 });
		const id = store2.allocateRoomId("PERSIST");
		store2.upsertPersistentRoomMeta(id, { passwordHash: "hash" });
		store2.cleanupExpiredRooms();
		assert.ok(store2.rooms.has(id));
	});

	it("upserts persistent room meta", () => {
		const meta = store.upsertPersistentRoomMeta("NEWMETA", {
			name: "Test Room",
			description: "A test",
		});
		assert.ok(meta);
		assert.equal(meta!.name, "Test Room");
		assert.equal(meta!.persistent, true);
	});

	it("removes a room", () => {
		const id = store.allocateRoomId("REMOVE");
		store.rooms.set(id, { passwordHash: null, hostPeerId: null, createdAt: Date.now() });
		assert.ok(store.rooms.has(id));
		store.removeRoom(id);
		assert.equal(store.rooms.has(id), false);
	});
});
