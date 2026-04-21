import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { logHttp, logWarn } from "./logger.js";

/* Optional: gzip-Kompression. Wenn das Paket nicht installiert ist (fresh-clone
 * ohne `npm install` nach der Dependency-Ergänzung), fallen wir auf eine No-Op
 * zurück, damit der Server trotzdem startet. Reverse-Proxies (Nginx/Caddy)
 * komprimieren ohnehin selbst — die Middleware ist nur für Direct-Deploys. */
let compression = () => (_req, _res, next) => next();
try {
	const mod = await import("compression");
	compression = mod.default ?? mod;
} catch (_err) {
	logWarn("compression module not installed — responses will be uncompressed. Run `npm install` to enable gzip.");
}
import { requestLogContextMiddleware } from "./middleware/requestLogContext.js";
import { createRoomsRouter } from "./routes/rooms.js";
import { createJoinRouter } from "./routes/join.js";
import { createGifsRouter } from "./routes/gifs.js";
import { attachStaticSpaIfPresent } from "./routes/staticSpa.js";
import { getRequestClientId } from "./authz.js";

/**
 * @param {object} opts
 * @param {ReturnType<import('./roomStore.js').createRoomStore>} opts.roomStore
 * @param {ReturnType<import('./db/adminDb.js').createAdminDb>} opts.adminDb
 * @param {string} opts.bootstrapAdminToken
 * @param {string} opts.tenorApiKey
 * @param {string} opts.repoRoot
 */
export function createApp(opts) {
	const { roomStore, adminDb, bootstrapAdminToken, tenorApiKey, repoRoot } = opts;
	const corsOrigins = new Set(
		(process.env.EASYMEET_CORS_ORIGINS || "")
			.split(",")
			.map((v) => v.trim())
			.filter(Boolean)
	);
	if (corsOrigins.size === 0) {
		corsOrigins.add("http://localhost:5173");
		corsOrigins.add("http://127.0.0.1:5173");
		corsOrigins.add("http://localhost:3001");
		corsOrigins.add("http://127.0.0.1:3001");
	}
	const apiRateLimitMax = Math.max(20, Number(process.env.EASYMEET_API_RATE_LIMIT_MAX || 120));
	const joinRateLimitMax = Math.max(5, Number(process.env.EASYMEET_JOIN_RATE_LIMIT_MAX || 30));
	/* Dedicated brute-force budget for the admin bootstrap login (48-char hex
	 * token → plenty entropy, but no reason to allow 120 guesses/min). */
	const bootstrapLoginRateLimitMax = Math.max(3, Number(process.env.EASYMEET_BOOTSTRAP_LOGIN_RATE_LIMIT_MAX || 5));

	const app = express();
	app.set("trust proxy", 1);
	app.use(
		helmet({
			crossOriginEmbedderPolicy: false,
			contentSecurityPolicy: {
				useDefaults: false,
				directives: {
					defaultSrc: ["'self'"],
					/* MediaPipe / @mediapipe/tasks-vision (background effects): WASM compile needs wasm-unsafe-eval, not full unsafe-eval. */
					scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
					styleSrc: ["'self'", "'unsafe-inline'"],
					imgSrc: ["'self'", "data:", "blob:", "https:"],
					connectSrc: ["'self'", "ws:", "wss:"],
					frameSrc: [
						"'self'",
						"https://www.youtube.com",
						"https://www.youtube-nocookie.com",
						"https://player.vimeo.com",
						"https://open.spotify.com",
						"https://w.soundcloud.com"
					],
					mediaSrc: ["'self'", "blob:", "mediastream:"],
					workerSrc: ["'self'", "blob:"],
					fontSrc: ["'self'", "data:"],
					objectSrc: ["'none'"],
					baseUri: ["'self'"],
					formAction: ["'self'"],
					/* Prevent clickjacking / UI redressing — app is a standalone SFU UI. */
					frameAncestors: ["'self'"]
				}
			},
			/* Same-origin opener policy hardens popup-based oauth / postMessage surfaces;
			 * harmless for the SFU UI and improves isolation. */
			crossOriginOpenerPolicy: { policy: "same-origin" }
		})
	);
	app.use(
		cors({
			origin: (origin, cb) => {
				if (!origin) return cb(null, true);
				if (corsOrigins.has(origin)) return cb(null, true);
				return cb(null, false);
			}
		})
	);
	/* gzip for JSON responses & the SPA bundle when the server is exposed directly
	 * (no reverse proxy). Skipped automatically for already-compressed content and
	 * for small payloads (default threshold 1 KB). Safe + idempotent behind a proxy. */
	app.use(compression());
	app.use(express.json({ limit: "1mb" }));
	app.use(
		"/api",
		rateLimit({
			windowMs: 60 * 1000,
			max: apiRateLimitMax,
			standardHeaders: true,
			legacyHeaders: false
		})
	);
	app.use(
		"/api/join",
		rateLimit({
			windowMs: 60 * 1000,
			max: joinRateLimitMax,
			standardHeaders: true,
			legacyHeaders: false
		})
	);
	/* Stricter limiter in front of the one-time bootstrap login; mounted before
	 * the route handler so it applies cleanly without changing router wiring. */
	app.use(
		"/api/admin/bootstrap-login",
		rateLimit({
			windowMs: 60 * 1000,
			max: bootstrapLoginRateLimitMax,
			standardHeaders: true,
			legacyHeaders: false
		})
	);
	app.use(requestLogContextMiddleware);
	app.use((req, _res, next) => {
		req.easymeet = req.easymeet || {};
		req.easymeet.clientId = getRequestClientId(req);
		next();
	});
	app.use((req, res, next) => {
		const start = Date.now();
		res.on("finish", () => {
			logHttp(req.method, req.originalUrl || req.url, res.statusCode, Date.now() - start, req.easymeet?.requestId);
		});
		next();
	});

	app.use("/api", createRoomsRouter({ roomStore, adminDb, bootstrapAdminToken }));
	app.use("/api", createJoinRouter({ roomStore, adminDb }));
	app.use("/api", createGifsRouter({ tenorApiKey }));

	attachStaticSpaIfPresent(app, { repoRoot });

	return app;
}
