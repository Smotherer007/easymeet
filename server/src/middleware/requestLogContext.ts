import { randomUUID } from "node:crypto";
import { runWithLogContext } from "../logger.ts";
import type { Request, Response, NextFunction } from "express";

export function requestLogContextMiddleware(req: Request, res: Response, next: NextFunction): void {
	const incoming =
		req.headers["x-request-id"] || req.headers["x-correlation-id"] || "";
	const requestId = String(incoming || randomUUID());
	res.setHeader("X-Request-Id", requestId);
	(req as ExpressRequest).easymeet = { requestId };
	runWithLogContext({ requestId }, () => next());
}

export interface ExpressRequest extends Request {
	easymeet: {
		requestId?: string;
		clientId?: string;
	};
}
