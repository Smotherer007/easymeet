# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Blur / virtueller Hintergrund:** Personenmaske **zeitlich geglättet** (pro Stream eigener State), **adaptives Kanten-Feather** und hochwertiges Masken-Scaling (`backgroundEffectsHelpers.js`); Segmentierung **alle 2 Frames** statt 3 für etwas stabilere Kanten.

### Added

- **Einstellungen → Mikrofon & Sprache:** Regler **Sprech-Erkennung** (Schwelle für die „spricht gerade“-Hervorhebung), Checkboxen **Rauschunterdrückung**, **Echounterdrückung**, **AGC** — wirkt auf `getUserMedia` und wird bei laufendem Mikro per `applyConstraints` versucht; Persistenz `localStorage` (`easymeet_audioSettings`).
- **Raumansicht:** **Latenz** (WebRTC-RTT, Mittelwert Send-/Empfangstransport zum Server) neben dem **Raumtitel** in der Kopfzeile; immer sichtbar, ohne Messwert Platzhalter **`–`** (`roomMediaLatencyNone`); Tooltip mit Kurzerklärung; Aktualisierung ca. alle 2 s.
- **Startseite / feste Räume:** Pfeil-Icon (**Absprung**) neben dem Raumcode – Hinweis auf Antippen/Beitritt, da kein Online-Status wie bei aktiven Räumen.
- **Aktive Räume:** API `GET /api/rooms/active` liefert pro Raum **`participants`** (sortierte VoIP-Nicks); Startseite zeigt sie unter dem Raumcode (max. 8 Namen, danach „+n weitere“).
- **Virtueller Hintergrund:** Das gewählte **Hintergrundbild** wird beim Compositing **horizontal gespiegelt** (`drawImageHorizontallyFlipped`); die Person bleibt wie die Kamera-Eingabe (unverändert zur Segmentierung).
- **Sounds:** `public/sounds/single-sound-message-icq-ooh.mp3` (Chat/Datei von anderen), `the-sound-of-knocking-on-the-door.mp3` (Beitritt), `icq_file_done.mp3` (fremde **Bildschirmfreigabe**), angebunden in `src/sounds.js` / `bootstrap.js`; VoIP-Mitgliederzuwachs nutzt dasselbe Klopfen wie Chat-Join.
- **Diagnose:** `src/utils/mediaDebug.js` — Logs **`[easymeet/media-debug]`** (als **warn**): automatisch in **Vite-Dev** (`npm run dev`), sonst `?easymeetMediaDebug=1` oder `localStorage easymeetMediaDebug=1`; abschalten in Dev: `easymeetMediaDebug=0`. UI-Pfad (`handleBackgroundEffectChange`), Kachel (`attachRemoteAudio`), Video-**track ended/mute**, verworfene Promise von `applyEffectToCallStream`.
- **`electron/`** – Desktop-Hülle mit **Electron** (lädt EasyMeet per URL; Scripts `npm run electron` / `electron:dev` im Root). Siehe `electron/README.md`.
- **Docker:** `.env.example`, `docker-compose.yml` mit optionalem `env_file: .env`, HTTP-Port-Mapping und zentral dokumentierten Variablen; **Dockerfile**-Kommentar zu Laufzeit-Env.
- **Persistente Räume** per JSON-Datei, Pfad in **`EASYMEET_PERSISTENT_ROOMS`** (`.env`); Vorlage **`config/persistent-rooms.example.json`** → `config/persistent-rooms.json` (gitignored). **24h-TTL** greift nicht. Startseite: **„Feste Räume“** via `GET /api/rooms/pinned`.
- **Docker:** Image enthält **`config/persistent-rooms.default.json`** → beim Build wird **`persistent-rooms.json`** gesetzt; **`ENV EASYMEET_PERSISTENT_ROOMS=/app/config/persistent-rooms.json`**, damit feste Räume ohne Volume/.env funktionieren. Eigene Liste per Volume mounten (Compose-Kommentar).
- Startseite: Liste **aktuell aktiver Räume** (mindestens eine Person im VoIP-Raum), API `GET /api/rooms/active`; die beiden Einstiegs-Kacheln sind ab ~640px Breite **nebeneinander**.
- Raum-IDs für Protoo/mediasoup und die aktive-Liste werden **einheitlich normalisiert** (Großbuchstaben, ohne Sonderzeichen), damit die Liste zuverlässig zum HTTP-Raum passt.

### Fixed

- **Meeting-Leiste:** Kamera-Button nutzt dieselbe **Farblogik** wie das Mikro (an = Akzent, aus = rot); `updateMuteButton` / `updateVideoButton` behalten `meeting-control-btn` an der unteren Leiste.
- **Teilnehmer-Lautstärke:** Slider aktualisiert bei Remote-Video jetzt auch das **versteckte Audio-Element** (`video-tile__remote-audio`), nicht nur das erste `video` (Split-Pipeline).
- **Medien-Latenz:** Anzeige bleibt stabiler (letzter gültiger Wert bei kurz fehlenden WebRTC-Stats); Auswertung akzeptiert mehr `candidate-pair`-Fälle und optional `inbound-rtp`/`remote-inbound-rtp` `roundTripTime`; Poll-Intervall 2 s.
- **mediasoup / Hintergrundwechsel:** „Channel request handler … **consumer.resume**“: Server-Consumer laufen mit **`paused: false`**; der Client hat danach **`resumeConsumer`** an den Server geschickt — dort führte **`resume()`** trotzdem zu einem Worker-Fehler. **`resumeConsumer`-Notify entfernt**; Server **`resumeConsumer`** nur noch bei **`consumer.paused`**. **`consumerClosed`** läuft in derselben **`consumingAwaitQueue`** wie **`newConsumer`**, um Races in mediasoup-client zu vermeiden. Zusätzlich: **`videoEnabled: false`** nur wenn keine andere live Video-Spur.
- **Video:** Keine Spiegelung in der WebRTC-/Canvas-Pipeline; **Anzeige** horizontal gespiegelt: **`scaleX(-1)`** auf **allen Video-Kacheln** (`.video-tile video`, lokal + remote) und **Kamera-Vorschau in den Einstellungen** (`.settings-modal .effect-preview-video`).
- **Free-Layout:** Chat/Teilnehmer **öffnen & schließen** nur noch `patchState` + **`floating-window--hidden`** am DOM – kein `navigate('room-view')` mehr (vermeidet komplettes UI-Flackern).
- **Free-Layout:** Beim **Kamera einschalten** (und jedem `navigate('room-view')`) wurden Chat- und Teilnehmer-Schwebefenster neu gerendert und standardmäßig **sichtbar** – jetzt **persistenter State** (`freeLayoutChatOpen` / `freeLayoutParticipantsOpen`), standardmäßig zugeklappt; Öffnen nur per Steuerleiste. Mobile-Overlay schließt die Schwebefenster korrekt (vorher fälschlich `remove('hidden')`).
- **Free-Layout:** Video-Schwebefenster ohne unnötigen **horizontalen Scrollbalken** (`overflow` / `min-width` am Body und in `.video-gallery--free`).
- **Hintergrund-Effekte:** Beim **zweiten** Wechsel brach der Stream, wenn `baseLocalStream` fälschlich dieselbe Video-Spur wie die Effekt-Ausgabe hatte (z. B. nach Unmute / `ensureInitialCallMedia`). Es wird die **Roh-Kamera** per `selectCameraVideoTrackForEffects` geklont; Mute/Unmute und Mikro-Nachladen halten Kamera vs. Effekt-Ausgabe getrennt.
- **Einstellungen / Hintergrund:** Mit **laufender Kamera** wurde der Effekt in der Vorschau manchmal **nur in der Vorschau** geändert, nicht im **Anruf-Stream** — veraltetes `_previewStream` im State oder zu strikte `videoTrack.enabled`-Prüfung. Beim Anzeigen von `localStream` in der Vorschau wird der Preview-Stream bereinigt; nach Effekt-Wechsel kein `navigate('room-view')` mehr, stattdessen VoIP-Update + Kachel-Auswahl.
- **mediasoup / Hintergrund:** Nach **Effektwechsel** blieb das ausgehende Video oft auf der **alten** Spur (`replaceTrack` mit `MediaStreamTrackGenerator` zuverlässig genug). Beim Wechsel der **Video-Spur** wird der **Webcam-Producer** jetzt **geschlossen und neu erzeugt** (wie bisher nur im Fehlerfall).
- **Hintergrund ab dem 2. Wechsel:** Der **500-ms-Retry** von `produceLocalTracks` konnte starten, sobald der Cam-Producer kurz **gelöscht** war (`updateLocalStream`) — **zweiter `produce`** / widersprüchlicher Zustand. Während **`updateLocalStream`** läuft, erzeugt der Retry **keinen** Webcam-Producer mehr (`_updateLock` steht jetzt **vor** dem Join-`try`). Zusätzlich wird **`baseLocalStream`** bei aktivem Effekt auf die **Roh-Kamera-Spur** gepinnt, damit `selectCameraVideoTrackForEffects` nicht aus Versehen die Generator-Spur nutzt.
- **Hintergrund + Kachel-Kamera:** Audio/Roh vor `await` snapshottet; nach Pipeline ein `patchState`. **Ab dem 2. Wechsel:** `base` enthält nur noch Roh → Pipeline bekommt **`base` direkt** (kein `raw.clone()`, `stopSourceVideoTrackOnCleanup: false`) und `baseLocalStream` wird **nicht** erneut per `new MediaStream([raw])` verschoben — vermeidet Chromium-Probleme mit mehrfachen Klonen / schwarzem Bild. Erster Wechsel weiterhin Klon + Cleanup. Pause nach Effekt-Stop **100 ms**.
- **Hintergrund aus / Kamera tot:** Früher `return`, sobald die **Generator-Spur** nach `stop()` `ended` war — der Merge zu Roh wurde **übersprungen**. Außerdem `stopOldTracks` per `t !== protect`: konnte die **Roh-Spur** treffen. Jetzt: bei **`none`** kein harter Abbruch ohne Roh; **Cleanup** nur für Spuren, die **nicht** mehr in `localStream`/`baseLocalStream` liegen; Merge bevorzugt **Video aus `base`**.
- **Gleicher Hintergrund erneut geklickt:** Kein erneutes `applyEffectToCallStream` — sonst `backgroundEffectStop()` + kompletter Neuaufbau → schwarze Kameras. Früher Abbruch in `handleBackgroundEffectChange`, wenn `next === current`.
- **Hintergrund blur → anderer Effekt / Bild:** Logs zeigten `video-track:ended` und `no-cam-after-stop` — nach `backgroundEffectStop()` fehlte eine brauchbare Roh-Spur im State. **Reparatur:** State + `updateLocalStream` auf die noch **live**e Geräte-Video-Spur (Scan über alle Spuren in base+local); **Pipeline** nutzt wieder **immer** `raw.clone()` als Quelle (`stopSourceVideoTrackOnCleanup`), nicht mehr den `base`-Stream direkt. **Selector:** gleiche Kamera-Spur in zwei MediaStreams ist OK, wenn **`deviceId`** gesetzt (vorher fälschlich `null`); Fallback **`selectFirstLiveDeviceVideoTrackFromStreams`**.
- **Hintergrund blur → anderer Effekt / Bild:** Nach `backgroundEffectStop()` trat **`no-cam-after-stop`** auf (Logs: `video-track:ended` auf der Kachel). **Reparatur** patcht State + `updateLocalStream` auf die noch **live**e Geräte-Video-Spur (Scan aller Spuren in base+local); die Effekt-Pipeline bekommt wieder **immer** `raw.clone()` statt den **`base`-Stream** direkt. **`selectCameraVideoTrackForEffects`:** dieselbe Roh-Spur in zwei MediaStreams ist zulässig, wenn **`deviceId`** gesetzt; Fallback **`selectFirstLiveDeviceVideoTrackFromStreams`**.
- **Weiterhin schwarz / `cam: null`:** `selectFirstLiveDeviceVideoTrackFromStreams` verlangte **`deviceId`** — oft leer → Reparatur griff nicht; Roh-Spur konnte in Chromium nach Bild-Effekt **beendet** sein. Jetzt Fallback **jede live-Video-Spur** (base vor local). Fehlt sie weiterhin bei **Kamera an** → **`getUserMedia` videoOnly** (`ensureCameraTrackWhenVideoEnabled`) vor Abbruch, bei **„Kein Hintergrund“** wenn Merge ohne Video, im Fehlerfall der Effekt-Pipeline; **`recoverCameraAfterEffectLoss`** in `handleBackgroundEffectChange`, wenn kein Video-Track mehr im State (vermeidet `no-video-track-tiles-only`-Sackgasse).
- **Hintergrund wechseln / aus mit laufender Kachel-Kamera:** `createVirtualBackgroundStream` verwendete `stopSourceVideoTrackOnCleanup` **ohne** Parameter → **ReferenceError** beim Stoppen (virtuelle Hintergründe), Cleanup unvollständig. Zusätzlich: Merge nach Effekt-Aus bevorzugt **live** Spur mit **deviceId** (echte Kamera statt Generator); **doppeltes `requestAnimationFrame`** vor `updateLocalStream`; **`attachRemoteAudio`** erst **nach** `stopOldTracks`; mediasoup: Webcam-Producer neu, wenn die alte Spur **`ended`** ist; lokale Kachel: bei **Kamera an** Video anzeigen wie bei Remote, wenn eine Video-Spur existiert.

### Changed

- **Kamera:** `getUserMedia`-Video mit **16:9** (`aspectRatio`, ideal **1280×720** statt 640×480); Effekt-Vorschau **16:9**; Teilnehmer-Minivorschau **16:9** – virtuelle Hintergründe weniger verzerrt.
- **Protoo-URL:** Nicht mehr an `import.meta.env.DEV` allein gekoppelt — **direkter Port 3001** nur bei **Vite auf :5173** oder **`VITE_MEDIASOUP_PROTOO_DIRECT`**. Sonst **`wss://<Origin>/ws`** (NPM/443). Siehe `docs/nginx-proxy-manager-protoo.md`.
- **Docker:** `EXPOSE` im Dockerfile entfernt; **docker-compose** ohne `ports:` – Zugriff nur über internes Netz/Proxy; RTP-UDP weiterhin bis zum Container durchreichen.
- Medien, Chat, Dateien und Bildschirmfreigabe laufen über **mediasoup + Protoo** auf dem Server (kein PeerJS mehr).
- **Dockerfile:** **`node:22-bookworm-slim`** statt Alpine – mediasoup-**Prebuild** (glibc) läuft typisch ohne langes Kompilat; Fallback-Build mit `python3`/`pip`/`build-essential`. Zuvor: Node 22 Alpine + `py3-pip`.
- Server lädt optional **`dotenv`** (`import 'dotenv/config'`), damit eine **`.env` im Projektroot** bei `npm run server` erkannt wird (z. B. `EASYMEET_PERSISTENT_ROOMS`).

### Removed

- Alte Pfade **`server/persistent-rooms*.json`** – ersetzt durch **`config/persistent-rooms.example.json`** + `config/persistent-rooms.json` und **`EASYMEET_PERSISTENT_ROOMS`**.
- Referenz-Clone `_reference/mediasoup-demo`, ungenutzte PeerJS-Module (`peer.js`, `peerHostHandlers.js`, `peerViewerHandlers.js`), Abhängigkeiten `peerjs`, `sdp-transform`, `websocket` (root).

## [0.1.0] - 2025-03-14

### Added

- P2P video conferencing via WebRTC (PeerJS)
- Audio & video with mute, device switching
- Screen sharing with optional system audio
- Chat with text, emojis, GIFs (Tenor/Giphy)
- File sharing (P2P, folders as ZIP)
- Virtual backgrounds (blur, presets, custom uploads)
- Speaking indicator
- Voice rooms (audio-only mode)
- Room management (password, room code, join via URL)
- Video layout (grid and free mode)
- Per-participant volume slider
- i18n (German, English)
- Docker support
