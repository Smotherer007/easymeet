declare global {
	namespace Express {
		interface Request {
			easymeet?: {
				requestId?: string;
				clientId?: string;
			};
		}
	}
}

export {};
