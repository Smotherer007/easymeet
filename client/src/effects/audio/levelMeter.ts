/**
 * Shared level metering for mic gate and speaking indicator.
 *
 * Uses time-domain RMS in dBFS instead of an average over `getByteFrequencyData()`.
 *
 * Why: the old metric averaged *all* FFT bins (0–24 kHz). A hardware microphone lifts every bin
 * with its broadband noise floor, so that average stayed above the threshold as soon as someone
 * spoke. A virtual / loopback device (PipeWire, JACK, VB-Cable, BlackHole …) delivers a clean,
 * band-limited signal whose energy sits in a handful of low bins only — the same average stayed
 * below the threshold even at normal loudness. Result: the gate never opened, the track carried
 * digital silence, and with `opusDtx: true` not a single packet was sent, while the level meter
 * in the UI stayed dark. RMS measures actual loudness and behaves identically for both cases.
 */

/** Analyser window: 1024 samples ≈ 21 ms @ 48 kHz — long enough for a stable RMS. */
export const METER_FFT_SIZE = 1024;

/** Nothing below this counts as signal (digital silence). */
export const SILENCE_DBFS = -100;

/** Stored threshold range (see audioSettingsStorage). */
const UI_MIN = 5;
const UI_MAX = 50;

/** dBFS the stored range maps onto: 5 = very sensitive, 50 = only louder speech. */
const DBFS_AT_UI_MIN = -62;
const DBFS_AT_UI_MAX = -28;

/**
 * Map the stored speaking threshold (5–50) to an absolute level in dBFS.
 * @param {number} threshold
 * @returns {number}
 */
export function speakingThresholdToDbfs(threshold) {
	const n = Number(threshold);
	const v = Math.min(UI_MAX, Math.max(UI_MIN, Number.isFinite(n) ? n : UI_MIN));
	return DBFS_AT_UI_MIN + ((v - UI_MIN) / (UI_MAX - UI_MIN)) * (DBFS_AT_UI_MAX - DBFS_AT_UI_MIN);
}

/**
 * Analyser configured for time-domain metering.
 * @param {AudioContext} ctx
 * @returns {AnalyserNode}
 */
export function createMeterAnalyser(ctx) {
	const analyser = ctx.createAnalyser();
	analyser.fftSize = METER_FFT_SIZE;
	/* Only affects frequency data; attack/release below does the smoothing. */
	analyser.smoothingTimeConstant = 0;
	return analyser;
}

/**
 * Reader for the current RMS level in dBFS (−100 … 0).
 * @param {AnalyserNode} analyser
 * @returns {() => number}
 */
export function createDbfsReader(analyser) {
	const buf = new Float32Array(analyser.fftSize);
	return function readDbfs() {
		analyser.getFloatTimeDomainData(buf);
		let sum = 0;
		for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
		const rms = Math.sqrt(sum / buf.length);
		if (!(rms > 0)) return SILENCE_DBFS;
		const db = 20 * Math.log10(rms);
		return db < SILENCE_DBFS ? SILENCE_DBFS : db;
	};
}
