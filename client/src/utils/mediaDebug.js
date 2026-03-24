/**
 * Diagnostics for camera / background effects / mediasoup.
 *
 * Enable (one is enough, then reload):
 * - URL: append `?easymeetMediaDebug=1`
 * - Console: `localStorage.setItem('easymeetMediaDebug', '1')`
 * - Vite dev (`npm run dev`): debug is **on automatically**
 *
 * Logs: **`[easymeet/media-debug]`** as **warn** (visible even when "Info" is filtered).
 * Disable: `localStorage.removeItem('easymeetMediaDebug')` and load without the URL param.
 *
 * ---
 * **B) Geräte-Hotplug / Mikro — Forschungs-Checkliste (Filter in der Konsole)**
 *
 * 1. Debug einschalten (siehe oben), Seite neu laden, Problem reproduzieren.
 * 2. Konsole filtern nach **`device:recovery`** (Recovery-Kette) und optional **`ms:`** (Mediasoup).
 * 3. Tabelle — Bedeutung der Phasen:
 *
 * | Phase / Präfix | Bedeutung |
 * |----------------|-----------|
 * | `device:recovery:chain:run` | Warteschlange gestartet nach **Track `ended`**, oder nach `devicechange` **nur wenn** der lokale Stream wirklich keine live Audio-/Video-Spur mehr hat (nicht bei Tab-Fokus/Sichtbarkeit; bei offenen Settings oft unterdrückt, wenn der Stream noch gesund ist). |
 * | `device:recovery:skip` | `payload.reason`: z. B. `not-room-view`, `no-local-stream` |
 * | `device:recovery:reacquire:start` | Reacquire-Logik läuft; `muted` / `wantVideo` im Payload |
 * | `device:recovery:abort` | `reason`: fehlende Callbacks (`no-replay-mute-unmute`, `no-rebind-mic-while-muted`) |
 * | `device:recovery:use-muted-rebind` | Nutzer war vor Replay stumm geworden → stummer Rebind-Pfad |
 * | `device:recovery:mute-unmute-cycle:*` | Replay wie Mute/Unmute (nur ungemutet) |
 * | `device:recovery:rebind-mic-while-muted:*` | Mikro neu bei stummem Nutzer |
 * | `device:recovery:camera-reacquire-skipped` | Webcam in stummem Zweig nicht neu bekommen |
 * | `device:recovery:post-chain:mic-producer-force` | Abschließender Mediasoup-`updateLocalStream` mit `forceMicProducer` |
 * | `device:recovery:reacquire:done` | `branch` im Payload: welcher Pfad fertig wurde |
 * | `device:recovery:error` | Exception im Reacquire-Block |
 * | `ms:do-update-local-stream:start` | Mediasoup verarbeitet Stream-Update |
 * | `ms:mic-producer:recreate` | Mic-Producer wird neu erzeugt |
 * | `ms:update-local-stream:queued` | Update wartet auf Lock (parallel anderer Pfad) |
 *
 * 4. **Auswertung:** `chain:run` fehlt trotz echtem Hotplug (Spur wirklich weg) → `devicechange`/Track-`ended` prüfen. Tab/Fokus triggern **keine** `chain:run` mehr. `chain:run` da, Ton trotzdem kaputt → `chrome://webrtc-internals` / Mediasoup-Logs.
 *
 * Einmal pro Browser-Tab wird beim ersten `device:recovery:chain:run` eine Kurzfassung in die Konsole geschrieben. Manuell: **`window.printEasymeetDeviceRecoveryGuide()`** (nur wenn Debug an).
 */

function urlDebugOn() {
	try {
		return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("easymeetMediaDebug") === "1";
	} catch {
		return false;
	}
}

const SESSION_GUIDE_KEY = "easymeet_media_debug_recovery_guide_v1";

/**
 * Gibt die Kurz-Checkliste B) in die Konsole (nützlich nach Reload oder manuell).
 * Nur sinnvoll mit aktivem Media-Debug (`easymeetMediaDebug`).
 */
export function printEasymeetDeviceRecoveryGuide() {
	if (!mediaDebugEnabled()) {
		console.warn(
			"[easymeet/media-debug] Media-Debug ist aus. Einschalten: ?easymeetMediaDebug=1 oder localStorage.setItem('easymeetMediaDebug','1'), dann Seite neu laden."
		);
	}
	const lines = [
		"[easymeet/media-debug] — Checkliste B) Geräte-Recovery (Kurz)",
		"Filter: \"device:recovery\" | optional \"ms:\" für Mediasoup",
		"· chain:run        → Recovery gestartet (fehlt oft = kein Browser-Event / Fokus)",
		"· reacquire:start/done/error → Kernpfad",
		"· mute-unmute-cycle / rebind-mic-while-muted → welcher Audio-Zweig",
		"· post-chain:mic-producer-force → finaler Mediasoup-Push",
		"· ms:mic-producer:recreate → Producer wirklich neu",
		"Vollständige Tabelle: Kopfkommentar in client/src/utils/mediaDebug.js"
	];
	console.warn(lines.join("\n"));
}

function maybePrintRecoveryGuideOnce(phase) {
	if (phase !== "device:recovery:chain:run") return;
	try {
		if (typeof sessionStorage === "undefined") return;
		if (sessionStorage.getItem(SESSION_GUIDE_KEY) === "1") return;
		sessionStorage.setItem(SESSION_GUIDE_KEY, "1");
	} catch {
		return;
	}
	printEasymeetDeviceRecoveryGuide();
}

export function mediaDebugEnabled() {
	try {
		if (typeof localStorage !== "undefined" && localStorage.getItem("easymeetMediaDebug") === "0") return false;
	} catch {
		/* ignore */
	}
	try {
		if (typeof import.meta !== "undefined" && import.meta.env?.DEV) return true;
	} catch {
		/* ignore */
	}
	if (urlDebugOn()) return true;
	try {
		return typeof localStorage !== "undefined" && localStorage.getItem("easymeetMediaDebug") === "1";
	} catch {
		return false;
	}
}

/**
 * @param {string} phase Short label (e.g. effect:apply:start)
 * @param {Record<string, unknown>} [data]
 */
export function mediaDebugLog(phase, data) {
	if (!mediaDebugEnabled()) return;
	maybePrintRecoveryGuideOnce(phase);
	const payload = data !== undefined ? data : {};
	console.warn("[easymeet/media-debug]", phase, payload);
}

/* Konsole: printEasymeetDeviceRecoveryGuide() — nur mit aktivem Media-Debug sinnvoll */
try {
	if (typeof globalThis !== "undefined") {
		globalThis.printEasymeetDeviceRecoveryGuide = printEasymeetDeviceRecoveryGuide;
	}
} catch {
	/* ignore */
}

/** Short summary of a MediaStreamTrack (no large objects). */
export function mediaDebugTrackInfo(t) {
	if (!t) return null;
	return {
		id: t.id,
		kind: t.kind,
		readyState: t.readyState,
		enabled: t.enabled,
		muted: t.muted,
		label: t.label?.slice?.(0, 80),
		deviceId: t.getSettings?.()?.deviceId?.slice?.(0, 12)
	};
}

const _wiredVideoDebug = new WeakSet();

/** Once: wire `ended` / `mute` on local video tracks to explain black picture without effect logs. */
export function mediaDebugWireStreamVideoTracks(stream, label) {
	if (!mediaDebugEnabled() || !stream?.getVideoTracks) return;
	for (const t of stream.getVideoTracks()) {
		if (!t || _wiredVideoDebug.has(t)) continue;
		_wiredVideoDebug.add(t);
		t.addEventListener("ended", () => {
			console.warn("[easymeet/media-debug]", "video-track:ended", {
				label,
				track: mediaDebugTrackInfo(t)
			});
		});
		t.addEventListener("mute", () => {
			console.warn("[easymeet/media-debug]", "video-track:mute", {
				label,
				track: mediaDebugTrackInfo(t)
			});
		});
	}
}

/** Video-/Audiospuren eines Streams als kompakte Liste. */
export function mediaDebugStreamInfo(stream) {
	if (!stream) return { video: [], audio: [] };
	return {
		video: (stream.getVideoTracks?.() ?? []).map(mediaDebugTrackInfo),
		audio: (stream.getAudioTracks?.() ?? []).map(mediaDebugTrackInfo)
	};
}
