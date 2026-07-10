/**
 * Replaces common text emoticons with Unicode emojis (chat).
 * Longer patterns first so e.g. :-) wins over :).
 */

const RULES = [
	[/:-?D\b/gi, "😁"],
	[/\b:x\b/gi, "😆"],
	[/:-?P\b/gi, "😛"],
	[/:-?\)/g, "🙂"],
	[/:-?\(/g, "😕"],
	[/;\)/g, "😉"],
	[/\b<3\b/g, "❤️"],
	[/:-?\*\)/g, "😘"],
	[/:-?o\b/gi, "😮"],
	[/\b:\|\b/g, "😐"],
	[/\b:D\b/g, "😀"],
	[/\b;\(+/g, "😢"],
	[/:thumbsup:/gi, "👍"],
	[/:thumbsdown:/gi, "👎"],
	[/:fire:/gi, "🔥"],
	[/:wave:/gi, "👋"],
	[/:clap:/gi, "👏"],
	[/:heart:/gi, "❤️"],
	[/:smile:/gi, "😊"],
	[/:laugh:/gi, "😂"],
	[/:cry:/gi, "😢"]
];

/**
 * @param {string} text
 * @returns {string}
 */
export function replaceEmojiShortcodes(text) {
	if (typeof text !== "string" || !text) return text;
	let out = text;
	for (const [re, emoji] of RULES) {
		out = out.replace(re, emoji);
	}
	return out;
}
