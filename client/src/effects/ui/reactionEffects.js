/**
 * Full-screen room effects — canvas, no extra dependencies.
 */

import { REACTION_EFFECT_IDS } from "../../shared/reactionEffectIds.js";

const ALLOWED = new Set(REACTION_EFFECT_IDS);

const PALETTE = ["#e879f9", "#818cf8", "#34d399", "#fbbf24", "#f87171", "#38bdf8", "#a78bfa", "#f472b6", "#fde047"];

/**
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} ctx
 */
function fitCanvas(canvas, ctx) {
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const w = window.innerWidth;
	const h = window.innerHeight;
	canvas.width = w * dpr;
	canvas.height = h * dpr;
	canvas.style.width = `${w}px`;
	canvas.style.height = `${h}px`;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * Each run gets its own fullscreen canvas — multiple effects run in parallel without clearing each other.
 *
 * @param {HTMLElement} appEl
 * @param {(ctx: CanvasRenderingContext2D, w: number, h: number, elapsed: number, frame: number) => boolean} tick
 * @param {number} maxMs
 */
function runAnimation(appEl, tick, maxMs) {
	const canvas = document.createElement("canvas");
	canvas.className = "reaction-effects-canvas";
	canvas.setAttribute("aria-hidden", "true");
	appEl.appendChild(canvas);
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		canvas.remove();
		return;
	}

	fitCanvas(canvas, ctx);
	const onResize = () => fitCanvas(canvas, ctx);
	window.addEventListener("resize", onResize);

	const t0 = performance.now();
	let frame = 0;

	function loop(now) {
		const elapsed = now - t0;
		const w = window.innerWidth;
		const h = window.innerHeight;
		ctx.clearRect(0, 0, w, h);
		const cont = tick(ctx, w, h, elapsed, frame);
		frame += 1;
		if (cont && elapsed < maxMs) {
			requestAnimationFrame(loop);
		} else {
			window.removeEventListener("resize", onResize);
			canvas.remove();
		}
	}
	requestAnimationFrame(loop);
}

/**
 * @param {HTMLElement} appEl
 */
function playConfetti(appEl) {
	const n = 130;
	/** @type {{ x: number; y: number; w: number; h: number; vx: number; vy: number; rot: number; vr: number; c: string }[]} */
	const parts = [];
	for (let i = 0; i < n; i++) {
		parts.push({
			x: Math.random() * window.innerWidth,
			y: -30 - Math.random() * window.innerHeight * 0.4,
			w: 5 + Math.random() * 7,
			h: 3 + Math.random() * 6,
			vx: (Math.random() - 0.5) * 2.8,
			vy: 1.8 + Math.random() * 4,
			rot: Math.random() * Math.PI * 2,
			vr: (Math.random() - 0.5) * 0.2,
			c: PALETTE[i % PALETTE.length]
		});
	}
	runAnimation(
		appEl,
		(ctx, w, h) => {
			let alive = false;
			for (const p of parts) {
				p.vy += 0.11;
				p.vx *= 0.997;
				p.x += p.vx;
				p.y += p.vy;
				p.rot += p.vr;
				if (p.y < h + 40) alive = true;
				const fade = Math.max(0, Math.min(1, 1 - (p.y - h * 0.45) / (h * 0.62)));
				ctx.save();
				ctx.globalAlpha = fade;
				ctx.translate(p.x, p.y);
				ctx.rotate(p.rot);
				ctx.fillStyle = p.c;
				ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
				ctx.restore();
			}
			return alive;
		},
		3200
	);
}

/**
 * @param {HTMLElement} appEl
 */
function playFireworks(appEl) {
	const w0 = window.innerWidth;
	const h0 = window.innerHeight;
	const bursts = [
		{ t: 0, x: w0 * (0.25 + Math.random() * 0.2), y: h0 * (0.22 + Math.random() * 0.12) },
		{ t: 380, x: w0 * (0.45 + Math.random() * 0.15), y: h0 * (0.18 + Math.random() * 0.1) },
		{ t: 760, x: w0 * (0.55 + Math.random() * 0.2), y: h0 * (0.25 + Math.random() * 0.1) }
	];
	/** @type {{ x: number; y: number; vx: number; vy: number; life: number; decay: number; c: string; r: number }[]} */
	const parts = [];
	let burstIdx = 0;

	runAnimation(
		appEl,
		(ctx, w, h, elapsed) => {
			while (burstIdx < bursts.length && elapsed >= bursts[burstIdx].t) {
				const b = bursts[burstIdx];
				burstIdx += 1;
				const cx = (b.x / w0) * w;
				const cy = (b.y / h0) * h;
				const count = 64;
				for (let i = 0; i < count; i++) {
					const a = (i / count) * Math.PI * 2 + Math.random() * 0.2;
					const sp = 2.8 + Math.random() * 4.5;
					parts.push({
						x: cx,
						y: cy,
						vx: Math.cos(a) * sp,
						vy: Math.sin(a) * sp,
						life: 1,
						decay: 0.009 + Math.random() * 0.01,
						c: PALETTE[(i + burstIdx * 7) % PALETTE.length],
						r: 1.8 + Math.random() * 2.4
					});
				}
			}
			let alive = false;
			for (const p of parts) {
				p.x += p.vx;
				p.y += p.vy;
				p.vy += 0.09;
				p.vx *= 0.985;
				p.life -= p.decay;
				if (p.life > 0.02) alive = true;
				ctx.save();
				ctx.globalAlpha = Math.max(0, p.life);
				ctx.fillStyle = p.c;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
				ctx.fill();
				ctx.restore();
			}
			return alive;
		},
		3000
	);
}

const SPARKLE_COLORS = ["#ffffff", "#fffbeb", "#fef9c3", "#fde047", "#facc15", "#fcd34d", "#e9d5ff", "#ddd6fe", "#c4b5fd", "#a5b4fc", "#7dd3fc", "#fef08a"];

/**
 * Cross star (4 rays) for larger sparkles.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {number} rot
 */
function drawSparkleStar(ctx, x, y, size, rot) {
	ctx.translate(x, y);
	ctx.rotate(rot);
	const s = size;
	ctx.fillRect(-s * 0.12, -s, s * 0.24, s * 2);
	ctx.fillRect(-s, -s * 0.12, s * 2, s * 0.24);
	ctx.rotate(-rot);
	ctx.translate(-x, -y);
}

/**
 * @param {HTMLElement} appEl
 */
function playSparkles(appEl) {
	const w0 = window.innerWidth;
	const h0 = window.innerHeight;
	const n = 140;
	/** @type {{ x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; r: number; rot: number; vrot: number; star: boolean }[]} */
	const parts = [];
	for (let i = 0; i < n; i++) {
		const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.15;
		const sp = 2.8 + Math.random() * 7.2;
		const star = Math.random() < 0.35;
		parts.push({
			x: w0 * (0.06 + Math.random() * 0.88),
			y: h0 * (0.68 + Math.random() * 0.22),
			vx: Math.cos(a) * sp + (Math.random() - 0.5) * 1.4,
			vy: Math.sin(a) * sp,
			life: 0,
			max: 1.15 + Math.random() * 1.05,
			c: SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)],
			r: star ? 5 + Math.random() * 9 : 2.5 + Math.random() * 5.5,
			rot: Math.random() * Math.PI * 2,
			vrot: (Math.random() - 0.5) * 0.22,
			star
		});
	}
	runAnimation(
		appEl,
		(ctx, w, h, elapsed, frame) => {
			let alive = false;
			for (const p of parts) {
				p.life += 0.016;
				p.x += p.vx;
				p.y += p.vy;
				p.vy += 0.035;
				p.vx *= 0.998;
				p.rot += p.vrot;
				const alpha = p.life < p.max * 0.2 ? p.life / (p.max * 0.2) : Math.max(0, 1 - (p.life - p.max * 0.2) / (p.max * 0.8));
				if (p.life < p.max) alive = true;
				const pulse = 0.78 + 0.22 * Math.sin(frame * 0.22 + p.x * 0.02);
				ctx.save();
				ctx.globalAlpha = Math.min(1, alpha);
				ctx.fillStyle = p.c;
				const blur = p.star ? 20 : 12;
				ctx.shadowBlur = blur;
				ctx.shadowColor = p.c;
				if (p.star) {
					const sz = p.r * pulse;
					drawSparkleStar(ctx, p.x, p.y, sz, p.rot + frame * 0.04);
				} else {
					ctx.beginPath();
					ctx.arc(p.x, p.y, p.r * pulse, 0, Math.PI * 2);
					ctx.fill();
				}
				ctx.shadowBlur = 0;
				ctx.restore();
			}
			return alive;
		},
		4200
	);
}

const HEART_COLORS = ["#fda4af", "#fb7185", "#f43f5e", "#e11d48", "#be123c", "#f9a8d4", "#ec4899", "#db2777"];

/**
 * Filled heart; tip at (tipX, tipY), height ~size (MDN bezier pattern).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} tipX
 * @param {number} tipY
 * @param {number} size
 */
function drawFilledHeartAtTip(ctx, tipX, tipY, size) {
	const x = tipX;
	const y = tipY - size;
	const topCurveHeight = size * 0.3;
	ctx.beginPath();
	ctx.moveTo(x, y + topCurveHeight);
	ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + topCurveHeight);
	ctx.bezierCurveTo(x - size / 2, y + (size + topCurveHeight) / 2, x, y + (size + topCurveHeight) / 2, x, y + size);
	ctx.bezierCurveTo(x, y + (size + topCurveHeight) / 2, x + size / 2, y + (size + topCurveHeight) / 2, x + size / 2, y + topCurveHeight);
	ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + topCurveHeight);
	ctx.closePath();
}

/**
 * @param {HTMLElement} appEl
 */
function playHearts(appEl) {
	const w0 = window.innerWidth;
	const h0 = window.innerHeight;
	/* Fewer particles; no shadowBlur (very expensive per frame per particle on the canvas compositor). */
	const n = 28;
	/** @type {{ x: number; y: number; vx: number; vy: number; s: number; rot: number; vr: number; c: string; wobble: number; wv: number }[]} */
	const parts = [];
	for (let i = 0; i < n; i++) {
		parts.push({
			x: w0 * (0.08 + Math.random() * 0.84),
			y: h0 * (0.75 + Math.random() * 0.28),
			vx: (Math.random() - 0.5) * 1.2,
			vy: -(2.2 + Math.random() * 3.8),
			s: 11 + Math.random() * 16,
			rot: (Math.random() - 0.5) * 0.35,
			vr: (Math.random() - 0.5) * 0.02,
			c: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
			wobble: Math.random() * Math.PI * 2,
			wv: 0.04 + Math.random() * 0.05
		});
	}
	runAnimation(
		appEl,
		(ctx, w, h, elapsed, frame) => {
			let alive = false;
			for (const p of parts) {
				p.wobble += p.wv;
				p.x += p.vx + Math.sin(p.wobble) * 0.85;
				p.y += p.vy;
				p.vy *= 0.998;
				p.rot += p.vr;
				if (p.y > -p.s * 2) alive = true;
				const topFade = Math.min(1, Math.max(0, p.y / (h * 0.22)));
				const a = 0.92 * topFade;
				ctx.save();
				ctx.globalAlpha = a;
				ctx.translate(p.x, p.y);
				ctx.rotate(p.rot);
				drawFilledHeartAtTip(ctx, 0, 0, p.s);
				ctx.fillStyle = p.c;
				ctx.fill();
				ctx.globalAlpha = a * 0.55;
				ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
				ctx.lineWidth = 1;
				ctx.stroke();
				ctx.restore();
			}
			return alive;
		},
		3400
	);
}

/**
 * @param {HTMLElement} appEl
 */
function playBubbles(appEl) {
	const w0 = window.innerWidth;
	const h0 = window.innerHeight;
	const n = 55;
	/** @type {{ x: number; y: number; r: number; vy: number; vx: number; wobble: number; wv: number; phase: number }[]} */
	const parts = [];
	for (let i = 0; i < n; i++) {
		parts.push({
			x: w0 * (0.05 + Math.random() * 0.9),
			y: h0 * (0.55 + Math.random() * 0.45),
			r: 6 + Math.random() * 32,
			vy: -(0.6 + Math.random() * 1.8),
			vx: (Math.random() - 0.5) * 0.35,
			wobble: Math.random() * Math.PI * 2,
			wv: 0.025 + Math.random() * 0.04,
			phase: Math.random() * Math.PI * 2
		});
	}
	runAnimation(
		appEl,
		(ctx, w, h, elapsed, frame) => {
			let alive = false;
			for (const p of parts) {
				p.wobble += p.wv;
				p.x += p.vx + Math.sin(p.wobble + p.phase) * 0.9;
				p.y += p.vy;
				p.r += Math.sin(frame * 0.08 + p.phase) * 0.04;
				if (p.y > -p.r) alive = true;
				const fade = Math.max(0.45, Math.min(0.95, 0.62 + Math.sin(frame * 0.06 + p.phase) * 0.15));
				const rr = Math.max(2, p.r);
				ctx.save();
				ctx.globalAlpha = fade * 0.88;
				ctx.strokeStyle = "rgba(255,255,255,0.75)";
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
				ctx.stroke();
				ctx.globalAlpha = fade * 0.35;
				ctx.fillStyle = "rgba(186, 230, 253, 0.5)";
				ctx.fill();
				ctx.globalAlpha = fade * 0.7;
				ctx.strokeStyle = "rgba(255,255,255,0.95)";
				ctx.lineWidth = 1.25;
				ctx.beginPath();
				ctx.arc(p.x - rr * 0.32, p.y - rr * 0.32, Math.max(1.5, rr * 0.2), 0, Math.PI * 2);
				ctx.stroke();
				ctx.restore();
			}
			return alive;
		},
		5000
	);
}

/**
 * @param {HTMLElement} appEl
 */
function playMeteors(appEl) {
	/** @type {{ x: number; y: number; vx: number; vy: number; len: number; life: number; w: number }[]} */
	const parts = [];
	let nextSpawnAt = 0;

	runAnimation(
		appEl,
		(ctx, w, h, elapsed) => {
			while (elapsed >= nextSpawnAt && elapsed < 3200 && parts.length < 36) {
				nextSpawnAt = elapsed + 55 + Math.random() * 130;
				const startTop = -40 - Math.random() * 140;
				const startX = w * (-0.08 + Math.random() * 0.58);
				const speed = 14 + Math.random() * 17;
				const angle = Math.PI * 0.24 + Math.random() * 0.2;
				parts.push({
					x: startX,
					y: startTop,
					vx: Math.cos(angle) * speed,
					vy: Math.sin(angle) * speed,
					len: 48 + Math.random() * 88,
					life: 1,
					w: 1.2 + Math.random() * 2.2
				});
			}

			for (let i = parts.length - 1; i >= 0; i--) {
				const p = parts[i];
				p.x += p.vx;
				p.y += p.vy;
				p.life -= 0.011;
				const speedMag = Math.hypot(p.vx, p.vy) || 1;
				if (p.y > h + 120 || p.x > w + 100 || p.life <= 0) {
					parts.splice(i, 1);
					continue;
				}
				const t = Math.max(0, p.life);
				const x1 = p.x;
				const y1 = p.y;
				const x0 = p.x - (p.vx / speedMag) * p.len * 0.42;
				const y0 = p.y - (p.vy / speedMag) * p.len * 0.42;
				const grd = ctx.createLinearGradient(x0, y0, x1, y1);
				grd.addColorStop(0, "rgba(140, 180, 255, 0)");
				grd.addColorStop(0.55, `rgba(210, 230, 255, ${0.5 * t})`);
				grd.addColorStop(1, `rgba(255, 255, 255, ${0.95 * t})`);
				ctx.save();
				ctx.strokeStyle = grd;
				ctx.lineWidth = p.w;
				ctx.lineCap = "round";
				ctx.beginPath();
				ctx.moveTo(x0, y0);
				ctx.lineTo(x1, y1);
				ctx.stroke();
				ctx.strokeStyle = `rgba(255,255,255,${0.55 * t})`;
				ctx.lineWidth = Math.max(0.8, p.w * 0.45);
				ctx.stroke();
				ctx.restore();
			}
			return parts.length > 0 || elapsed < 900;
		},
		4000
	);
}

/**
 * @param {HTMLElement} appEl
 * @param {string} effectId
 */
export function playReactionEffect(appEl, effectId) {
	const id = typeof effectId === "string" ? effectId.trim() : String(effectId ?? "").trim();
	if (!ALLOWED.has(id)) return;
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

	if (id === "confetti") playConfetti(appEl);
	else if (id === "fireworks") playFireworks(appEl);
	else if (id === "sparkles") playSparkles(appEl);
	else if (id === "hearts") playHearts(appEl);
	else if (id === "bubbles") playBubbles(appEl);
	else if (id === "meteors") playMeteors(appEl);
}
