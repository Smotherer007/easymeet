import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootConfigDir = path.resolve(__dirname, "..");

function httpToWsTarget(httpUrl: string): string {
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
	const apiTarget = env.VITE_PROXY_API_TARGET || "http://localhost:3001";

	return {
		envDir: rootConfigDir,
		server: {
			port: 5173,
			proxy: {
				"/api": { target: apiTarget, changeOrigin: true },
				"/ws": { target: httpToWsTarget(apiTarget), ws: true, changeOrigin: true },
			},
		},
		optimizeDeps: {
			include: ["protoo-client"],
		},
		build: {
			rollupOptions: {
				output: {
					manualChunks(id: string) {
						if (!id.includes("node_modules")) return undefined;
						if (id.includes("/mediasoup-client/") || id.includes("/protoo-client/") || id.includes("/awaitqueue/")) {
							return "mediasoup";
						}
						if (id.includes("/@mediapipe/tasks-vision/") || id.includes("/@mediapipe/selfie_segmentation/")) {
							return "mediapipe";
						}
						if (id.includes("/lucide/")) return "icons";
						if (id.includes("/qrcode/")) return "qrcode";
						if (id.includes("/fflate/")) return "fflate";
						return undefined;
					},
				},
			},
		},
	};
});
