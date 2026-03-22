/**
 * Keep window rectangles inside the visible area (layout viewport / visualViewport).
 */
import { WINDOW_POSITION_DEFAULTS } from "../../shared/windowPositionsDefaults.js";

/** Minimum sizes (aligned with room-view.js modals / FLOATING_WINDOW_MIN). */
export const WINDOW_RECT_MINS = {
	videos: { w: 320, h: 280 },
	chat: { w: 280, h: 300 },
	participants: { w: 200, h: 180 },
	stream: { w: 320, h: 240 },
	settings: { w: 360, h: 400 },
	share: { w: 360, h: 400 },
	polls: { w: 300, h: 260 }
};

export function getViewportRect() {
	if (typeof window === "undefined") {
		return { x: 0, y: 0, width: 1920, height: 1080 };
	}
	const vv = window.visualViewport;
	if (vv && vv.width > 0 && vv.height > 0) {
		return {
			x: vv.offsetLeft,
			y: vv.offsetTop,
			width: vv.width,
			height: vv.height
		};
	}
	return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
}

function clampNum(n, lo, hi) {
	if (hi < lo) return lo;
	return Math.min(hi, Math.max(lo, n));
}

/**
 * Adjust x, y, w, h so the rectangle fits fully inside the viewport.
 */
export function clampWindowRect(rect, minW, minH, margin = 4) {
	const v = getViewportRect();
	const capW = Math.max(0, v.width - margin * 2);
	const capH = Math.max(0, v.height - margin * 2);
	const loW = Math.min(minW, capW);
	const loH = Math.min(minH, capH);
	let w = clampNum(Number(rect.w) || minW, loW, Math.max(loW, capW));
	let h = clampNum(Number(rect.h) || minH, loH, Math.max(loH, capH));
	if (!Number.isFinite(w) || w <= 0) w = loW;
	if (!Number.isFinite(h) || h <= 0) h = loH;
	const minX = v.x + margin;
	const minY = v.y + margin;
	const maxX = v.x + v.width - w - margin;
	const maxY = v.y + v.height - h - margin;
	const x = clampNum(Number(rect.x) || 0, Math.min(minX, maxX), Math.max(minX, maxX));
	const y = clampNum(Number(rect.y) || 0, Math.min(minY, maxY), Math.max(minY, maxY));
	return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

export function clampWindowRectById(id, rect) {
	const m = WINDOW_RECT_MINS[id] || { w: 200, h: 150 };
	return clampWindowRect(rect, m.w, m.h);
}

/** Position only; size unchanged (drag). */
export function clampDraggablePosition(left, top, width, height, margin = 4) {
	const c = clampWindowRect({ x: left, y: top, w: width, h: height }, 1, 1, margin);
	return { left: c.x, top: c.y };
}

export function mergeAndClampWindowRect(id, defaultsForId, storedPartial) {
	const d = defaultsForId;
	const p = storedPartial || {};
	const raw = { x: p.x ?? d.x, y: p.y ?? d.y, w: p.w ?? d.w, h: p.h ?? d.h };
	if (typeof window === "undefined") return raw;
	return clampWindowRectById(id, raw);
}

/** localStorage / state: merge with defaults and clamp all known ids. */
export function mergeAndClampAllWindowPositions(stored) {
	const base = { ...WINDOW_POSITION_DEFAULTS };
	if (stored && typeof stored === "object") {
		for (const k of Object.keys(stored)) {
			if (stored[k] && typeof stored[k] === "object") {
				base[k] = { ...(base[k] || {}), ...stored[k] };
			}
		}
	}
	const out = {};
	for (const id of Object.keys(base)) {
		const d = WINDOW_POSITION_DEFAULTS[id];
		if (!d) {
			out[id] = base[id];
			continue;
		}
		out[id] = mergeAndClampWindowRect(id, d, base[id]);
	}
	return out;
}
