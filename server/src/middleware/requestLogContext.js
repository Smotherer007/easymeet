import { randomUUID } from "node:crypto";
import { runWithLogContext } from "../logger.js";

/**
 * Sets X-Request-Id (or forwards X-Request-Id / X-Correlation-Id) and ALS for handlers.
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
