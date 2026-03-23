/**
 * Schwebende Emoji-Reaktionen über der Video-Galerie (an der Kachel des Absenders).
 * Mehrere gleichzeitig: jeweils eigenes Element; sichtbarer Layer (Grid vs. schwebendes Fenster).
 */

/**
 * @param {HTMLElement} appEl
 * @returns {HTMLElement | null}
 */
function getVisibleReactionFloatLayer(appEl) {
	/** @type {HTMLElement | null} */
	let fallback = null;
	for (const el of appEl.querySelectorAll(".reaction-float-layer")) {
		const h = /** @type {HTMLElement} */ (el);
		if (!fallback) fallback = h;
		const r = h.getBoundingClientRect();
		if (r.width > 1 && r.height > 1) return h;
	}
	return fallback;
}

/**
 * @param {HTMLElement} appEl
 * @param {string} peerId
 * @param {string} emoji
 */
export function spawnFloatingReaction(appEl, peerId, emoji) {
	const layer = getVisibleReactionFloatLayer(appEl);
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
	const left = anchorRect.left - layerRect.left + w * 0.28 + Math.random() * w * 0.38;
	const bottom = anchorRect.bottom - layerRect.bottom + 8 + Math.random() * 36;

	el.style.left = `${Math.max(4, left)}px`;
	el.style.bottom = `${bottom}px`;

	layer.appendChild(el);
	window.setTimeout(() => el.classList.add("reaction-float--animate"), 10);
	window.setTimeout(() => {
		el.remove();
	}, 2600);
}
