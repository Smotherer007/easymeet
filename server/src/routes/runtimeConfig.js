import { Router } from "express";

/**
 * Liefert zur Laufzeit konfigurierte Werte ans Frontend. Wird beim Boot des
 * Clients einmal geholt und dort gecacht.
 *
 * Warum nicht VITE_* / Build-Zeit-Env?
 *  - Die Docker-Deployment nutzt ein pre-built Image (smotherer/easymeet:latest),
 *    dem Keys per `env_file` / docker-compose zur Runtime mitgegeben werden.
 *  - VITE_*-Vars werden beim Build in den JS-Bundle gebacken. Ein Wechsel
 *    des Keys würde ein Image-Rebuild erfordern; außerdem würde der Key im
 *    veröffentlichten Image landen.
 *  - Dieser Endpoint liest die Variablen zur Runtime aus process.env — der
 *    Key bleibt in der operator-eigenen `.env` (gitignored) und nur dort.
 *
 * Sicherheitshinweis: Der ausgespielte Giphy-Key ist clientseitig sichtbar
 * (Network-Tab), was bei einem Browser-SDK-Key akzeptabel ist (Beta-Keys
 * sind rate-limited; Giphys Empfehlung für Web-Integration). Keine Keys
 * einbauen, die serverseitig bleiben müssen.
 *
 * @param {{ giphyApiKey?: string }} deps
 */
export function createRuntimeConfigRouter(deps) {
	const router = Router();
	const giphyApiKey = typeof deps.giphyApiKey === "string" ? deps.giphyApiKey : "";

	router.get("/runtime-config.json", (_req, res) => {
		/* Cache bewusst kurz (60 s): Wenn ein Operator per docker restart den Key
		 * tauscht, soll das zügig beim Client ankommen, aber nicht jede Boot-
		 * Anfrage ungebufferd bis zum Origin laufen. */
		res.set("Cache-Control", "public, max-age=60");
		res.json({ giphyApiKey });
	});

	return router;
}
