/**
 * Schwebende Emoji-Reaktionen über der Video-Galerie (an der Kachel des Absenders).
 */

/**
 * @param {HTMLElement} appEl
 * @param {string} peerId
 * @param {string} emoji
 */
export function spawnFloatingReaction(appEl, peerId, emoji) {
	const layer = appEl.querySelector("#reaction-float-layer");
	if (!layer || !emoji) return;

	const tile = appEl.querySelector(`.video-tile[data-peer-id="${CSS.escape(peerId)}"]`);
	const anchor = tile || appEl.querySelector("#video-gallery") || layer;

	const layerRect = layer.getBoundingClientRect();
	const anchorRect = anchor.getBoundingClientRect();

	const el = document.createElement("div");
	el.className = "reaction-float";
	el.textContent = emoji;
	el.setAttribute("aria-hidden", "true");

	const w = anchorRect.width || layerRect.width;
	const left = anchorRect.left - layerRect.left + w * 0.35 + Math.random() * w * 0.25;
	const bottom = anchorRect.bottom - layerRect.bottom + 8;

	el.style.left = `${Math.max(4, left)}px`;
	el.style.bottom = `${bottom}px`;

	layer.appendChild(el);
	window.setTimeout(() => el.classList.add("reaction-float--animate"), 10);
	window.setTimeout(() => {
		el.remove();
	}, 2600);
}
