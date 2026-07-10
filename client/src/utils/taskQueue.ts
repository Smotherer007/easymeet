/** Minimal sequential async task queue — replaces awaitqueue. */
export class TaskQueue {
	private queue: Array<() => Promise<void>> = [];
	private running = false;

	async push<T>(fn: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.queue.push(async () => {
				try {
					resolve(await fn());
				} catch (e) {
					reject(e);
				}
			});
			this.run();
		});
	}

	private async run(): Promise<void> {
		if (this.running) return;
		this.running = true;
		while (this.queue.length > 0) {
			const task = this.queue.shift()!;
			await task();
		}
		this.running = false;
	}
}
