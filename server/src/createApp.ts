import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { logHttp, logWarn } from "./logger.ts";
import { requestLogContextMiddleware } from "./middleware/requestLogContext.ts";
import { createRoomsRouter } from "./routes/rooms.ts";
import { createJoinRouter } from "./routes/join.ts";
import { createRuntimeConfigRouter } from "./routes/runtimeConfig.ts";
import { attachStaticSpaIfPresent } from "./routes/staticSpa.ts";
import { getRequestClientId } from "./authz.ts";
import type { RoomStore } from "./roomStore.ts";
import type { createAdminDb } from "./db/adminDb.ts";

type AdminDb = ReturnType<typeof createAdminDb>;

// Optional: gzip compression
let compression: () => express.RequestHandler = () => (_req, _res, next) => next();
try {
	const mod = await import("compression");
	compression = (mod.default ?? mod) as () => express.RequestHandler;
} catch {
	logWarn("compression module not installed — responses will be uncompressed. Run `npm install` to enable gzip.");
}

export function createApp(opts: {
	roomStore: RoomStore;
	adminDb: AdminDb;
	bootstrapAdminToken: string;
	giphyApiKey: string;
	repoRoot: string;
}): express.Express {
	const { roomStore, adminDb, bootstrapAdminToken, giphyApiKey, repoRoot } = opts;
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
					scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
					styleSrc: ["'self'", "'unsafe-inline'"],
					imgSrc: ["'self'", "data:", "blob:", "https:"],
					connectSrc: ["'self'", "ws:", "wss:", "https://api.giphy.com", "https://pingback.giphy.com"],
					frameSrc: [
						"'self'",
						"https://www.youtube.com",
						"https://www.youtube-nocookie.com",
						"https://player.vimeo.com",
						"https://open.spotify.com",
						"https://w.soundcloud.com",
					],
					mediaSrc: ["'self'", "blob:", "mediastream:"],
					workerSrc: ["'self'", "blob:"],
					fontSrc: ["'self'", "data:"],
					objectSrc: ["'none'"],
					baseUri: ["'self'"],
					formAction: ["'self'"],
					frameAncestors: ["'self'"],
				},
			},
			crossOriginOpenerPolicy: { policy: "same-origin" as const },
		})
	);
	app.use(
		cors({
			origin: (origin, cb) => {
				if (!origin) return cb(null, true);
				if (corsOrigins.has(origin)) return cb(null, true);
				return cb(null, false);
			},
		})
	);
	app.use(compression());
	app.use(express.json({ limit: "1mb" }));
	app.use(
		"/api",
		rateLimit({
			windowMs: 60 * 1000,
			max: apiRateLimitMax,
			standardHeaders: true,
			legacyHeaders: false,
		})
	);
	app.use(
		"/api/join",
		rateLimit({
			windowMs: 60 * 1000,
			max: joinRateLimitMax,
			standardHeaders: true,
			legacyHeaders: false,
		})
	);
	app.use(
		"/api/admin/bootstrap-login",
		rateLimit({
			windowMs: 60 * 1000,
			max: bootstrapLoginRateLimitMax,
			standardHeaders: true,
			legacyHeaders: false,
		})
	);
	app.use(requestLogContextMiddleware);
	app.use((req, _res, next) => {
		req.easymeet = req.easymeet || {};
		req.easymeet!.clientId = getRequestClientId(req);
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
	app.use("/api", createJoinRouter({ roomStore }));
	app.use("/api", createRuntimeConfigRouter({ giphyApiKey }));

	attachStaticSpaIfPresent(app, { repoRoot });

	return app;
}
