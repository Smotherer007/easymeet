/**
 * Floating emoji reactions — same idea as reactionEffects.js: append to #app with position:fixed
 * so overflow:hidden (e.g. floating video window) does not clip them.
 */

/**
 * @param {HTMLElement} appEl
 * @param {string} peerId
 * @param {string} emoji
 */
export function spawnFloatingReaction(appEl, peerId, emoji) {
	if (!emoji || !appEl) return;

	const tile =
		peerId && typeof peerId === "string"
			? appEl.querySelector(`.video-tile[data-peer-id="${CSS.escape(peerId)}"]`)
			: null;
	const gallery = appEl.querySelector("#video-gallery");
	const anchor = tile || gallery;

	let leftPx;
	let bottomPx;
	if (anchor?.getBoundingClientRect) {
		const r = anchor.getBoundingClientRect();
		const w = r.width || Math.min(360, window.innerWidth * 0.85);
		const left = r.left + w * 0.28 + Math.random() * w * 0.38;
		leftPx = Math.max(8, Math.min(left, window.innerWidth - 40));
		bottomPx = Math.max(8, window.innerHeight - r.bottom + 8 + Math.random() * 36);
	} else {
		leftPx = window.innerWidth * 0.35 + Math.random() * window.innerWidth * 0.25;
		bottomPx = 100 + Math.random() * 80;
	}

	const el = document.createElement("div");
	el.className = "reaction-float reaction-float--viewport";
	el.textContent = emoji;
	el.setAttribute("aria-hidden", "true");
	el.style.left = `${leftPx}px`;
	el.style.bottom = `${bottomPx}px`;

	appEl.appendChild(el);
	requestAnimationFrame(() => el.classList.add("reaction-float--animate"));
	window.setTimeout(() => el.remove(), 2600);
}
