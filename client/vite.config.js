import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Gemeinsam mit dem API-Server: Repo-Root `.env` (nur VITE_* gehen ins Bundle). */
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
		}
	};
});
