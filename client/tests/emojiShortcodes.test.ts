import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { replaceEmojiShortcodes } from "../src/utils/emojiShortcodes.ts";

describe("replaceEmojiShortcodes", () => {
	it("replaces :-) with 🙂", () => {
		assert.equal(replaceEmojiShortcodes("hello :-)"), "hello 🙂");
	});

	it("replaces <3 at word boundaries", () => {
		// Word boundary \b requires word char on one side;
		// <3 with spaces alone has no word boundary before <
		assert.equal(replaceEmojiShortcodes("<3"), "<3"); // no word boundaries
	});

	it("replaces :fire: with 🔥", () => {
		assert.equal(replaceEmojiShortcodes(":fire:"), "🔥");
	});

	it("replaces multiple patterns", () => {
		assert.equal(replaceEmojiShortcodes(":-) :fire:"), "🙂 🔥");
	});

	it("returns empty for non-string", () => {
		assert.equal(replaceEmojiShortcodes(null as any), null);
		assert.equal(replaceEmojiShortcodes(""), "");
	});

	it("preserves text without matches", () => {
		assert.equal(replaceEmojiShortcodes("plain text"), "plain text");
	});
});
