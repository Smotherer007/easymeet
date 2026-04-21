import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Shared with API server: repo-root `.env` (only VITE_* is bundled). */
const rootConfigDir = path.resolve(__dirname, "..");

function httpToWsTarget(httpUrl) {
	try {
		const u = new URL(httpUrl);
		u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
		return u.toString();
	} catch {
		return "ws://localhost:3001";
	}
}

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, rootConfigDir, "");
	/** If only `npm run dev` runs without backend → ECONNREFUSED on /api/join */
	const apiTarget = env.VITE_PROXY_API_TARGET || "http://localhost:3001";

	return {
		envDir: rootConfigDir,
		server: {
			port: 5173,
			proxy: {
				"/api": { target: apiTarget, changeOrigin: true },
				/* Protoo: in dev the client uses :3001/ws directly (see mediasoupClient getProtooUrl). Proxy as fallback. */
				"/ws": { target: httpToWsTarget(apiTarget), ws: true, changeOrigin: true }
			}
		},
		optimizeDeps: {
			include: ["protoo-client"]
		},
		build: {
			/* Split the big, rarely-changing dependencies into their own chunks so
			 * app-code edits don't bust caches for the ~MBs of media/mediasoup/
			 * mediapipe bundles, and the emoji picker can stream in lazily. */
			rollupOptions: {
				output: {
					manualChunks: {
						mediasoup: ["mediasoup-client", "protoo-client", "awaitqueue"],
						mediapipe: ["@mediapipe/tasks-vision", "@mediapipe/selfie_segmentation"],
						icons: ["lucide"],
						qrcode: ["qrcode"],
						fflate: ["fflate"]
					}
				}
			}
		}
	};
});
