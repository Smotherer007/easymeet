/**
 * Ersetzt gängige Text-Emoticons durch Unicode-Emojis (Chat).
 * Längere Muster zuerst, damit z. B. :-) vor :) gewinnt.
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
