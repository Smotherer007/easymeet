/**
 * Watchdog for outgoing audio.
 *
 * A conferencing client can go completely silent without anything looking wrong: a speech gate that
 * never opens, a producer that was not recreated after a track swap, a track left disabled. With
 * Opus DTX no packets are sent at all in that state, so nobody notices until someone asks
 * "can you hear me?".
 *
 * The check is deliberately narrow: only when the microphone actually carries signal *and* the
 * outgoing counters stay flat is something wrong. Simply not speaking looks identical in the RTP
 * stats, which is why the input peak is part of the condition.
 */

import { getState } from "../../store/index.js";
import * as selectors from "../../domain/selectors/index.js";
import { showToast } from "../../utils/toast.js";
import { t } from "../../i18n.js";
import { readMicPeakDbfs } from "./micNoiseGate.js";

const POLL_MS = 4000;
/** Warn only after the situation has held this long. */
const SILENT_AFTER_MS = 12000;
/** Input above this counts as real signal, not room tone. */
const INPUT_ACTIVE_DBFS = -55;
/** Do not repeat the hint more often than this. */
const REWARN_AFTER_MS = 120000;

let timer = 0;
let silentSince = 0;
let lastWarnTs = 0;
let lastPackets = -1;
let lastEnergy = -1;

function reset() {
	silentSince = 0;
	lastPackets = -1;
	lastEnergy = -1;
}

/** A new room is a new situation — the rate limit must not carry over from the previous one. */
function resetForNewSession() {
	reset();
	lastWarnTs = 0;
}

async function tick() {
	const peakDbfs = readMicPeakDbfs();
	const s = getState();
	if (selectors.selectScreen(s) !== "room-view" || selectors.selectIsMuted(s)) {
		reset();
		return;
	}

	const participant = selectors.selectHostPeer(s) || selectors.selectViewerConn(s);
	const stats = await participant?.getMicOutboundAudioStats?.().catch(() => null);

	const inputActive = peakDbfs > INPUT_ACTIVE_DBFS;
	const moving = stats != null && !stats.paused && ((lastPackets >= 0 && stats.packetsSent > lastPackets) || (lastEnergy >= 0 && stats.totalAudioEnergy > lastEnergy + 1e-7));

	if (stats) {
		lastPackets = stats.packetsSent;
		lastEnergy = stats.totalAudioEnergy;
	}

	if (moving || !inputActive) {
		silentSince = 0;
		return;
	}

	const now = Date.now();
	if (!silentSince) {
		silentSince = now;
		return;
	}
	if (now - silentSince < SILENT_AFTER_MS) return;
	if (now - lastWarnTs < REWARN_AFTER_MS) return;
	lastWarnTs = now;
	silentSince = 0;
	console.warn("[easymeet] microphone has signal but nothing is being sent", { peakDbfs, stats });
	showToast(t("micNoAudioSentWarning"), { type: "warning", duration: 9000 });
}

/** Start polling (room entered). */
export function startMicSilenceWatchdog() {
	stopMicSilenceWatchdog();
	resetForNewSession();
	timer = window.setInterval(() => void tick(), POLL_MS);
}

/** Stop polling (room left). */
export function stopMicSilenceWatchdog() {
	if (timer) window.clearInterval(timer);
	timer = 0;
	reset();
}
