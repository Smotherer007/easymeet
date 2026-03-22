import { randomUUID } from "node:crypto";
import { runWithLogContext } from "../logger.js";

/**
 * Setzt X-Request-Id (oder übernimmt X-Request-Id / X-Correlation-Id) und ALS für Handler.
 */
export function requestLogContextMiddleware(req, res, next) {
	const incoming =
		req.headers["x-request-id"] || req.headers["x-correlation-id"] || "";
	const requestId = String(incoming || randomUUID());
	res.setHeader("X-Request-Id", requestId);
	/** @type {{ requestId?: string }} */
	req.easymeet = { requestId };
	runWithLogContext({ requestId }, () => next());
}
