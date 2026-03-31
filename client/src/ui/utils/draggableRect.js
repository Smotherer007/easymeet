/**
 * Geometry for draggable overlay windows (floating windows, modals).
 * Layout only via CSS (.draggable-rect + custom properties).
 */

/**
 * @param {{ x: number; y: number; w: number; h: number }} rect
 * @returns {string} Custom properties only, for the style attribute
 */
export function draggableRectInlineStyle(rect) {
	const x = Math.round(rect.x);
	const y = Math.round(rect.y);
	const w = Math.round(rect.w);
	const h = Math.round(rect.h);
	return `--draggable-x:${x}px;--draggable-y:${y}px;--draggable-w:${w}px;--draggable-h:${h}px;--draggable-transform:none`;
}

/**
 * @param {HTMLElement | null | undefined} el
 * @param {{ x: number; y: number; w: number; h: number }} rect
 * @param {{ transform?: string }} [opts]
 */
export function applyDraggableRect(el, rect, opts = {}) {
	if (!el) return;
	const tf = opts.transform ?? "none";
	/* Nur Custom Properties — keine Konkurrenz mit width/left aus dem Stylesheet */
	el.style.removeProperty("width");
	el.style.removeProperty("height");
	el.style.removeProperty("left");
	el.style.removeProperty("top");
	el.style.removeProperty("transform");
	el.style.setProperty("--draggable-x", `${Math.round(rect.x)}px`);
	el.style.setProperty("--draggable-y", `${Math.round(rect.y)}px`);
	el.style.setProperty("--draggable-w", `${Math.round(rect.w)}px`);
	el.style.setProperty("--draggable-h", `${Math.round(rect.h)}px`);
	el.style.setProperty("--draggable-transform", tf);
}
