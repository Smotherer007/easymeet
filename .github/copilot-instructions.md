# GitHub Copilot Instructions

## Sprache und Umgebung

- **Hauptsprache**: JavaScript (TypeScript-ready)
- **Code-Dokumentation**: Alle Kommentare, JSDoc und Blockkommentare im Quellcode **auf Englisch** (keine deutschsprachigen Erklärungen in `//`, `/* */`, `/** */`).
- **Frontend**: Vite + Browser APIs + modulare Screens
- **Backend**: Node.js + Express
- **Realtime**: mediasoup (SFU) + Protoo-WebSocket + WebRTC (Browser ↔ Server)
- **Zielplattform**: Browser Client + Node Server

---

## Verbindliche Programmier-Prinzipien

Die folgenden Punkte **2–5** und die **DOP-Umbauprinzipien** sind verbindlich fuer **neuen** Code und fuer Refactors, die du anfasst.

**Ausnahme (bewusst nicht verbindlich):** Maximale **Zeilenanzahl** pro Funktion — im bestehenden Code nicht durchsetzbar ohne Massiv-Refactor; bei neuem Code trotzdem moeglichst **eine Rolle pro Funktion** anstreben.

### 1. Eine Funktion = Eine Rolle (ohne Zeilenlimit-Pflicht)

Jede Funktion soll **eine** klar erkennbare Rolle haben (Validierung, Transformation, Abfrage, I/O).

| Rolle          | Rueckgabe       | Seiteneffekte | Beispiele                                                    |
| -------------- | --------------- | ------------- | ------------------------------------------------------------ |
| Validierung    | `Result<T>`     | Keine         | `validateJoinPayload`, `validateChatMessage`                 |
| Transformation | Neue Daten      | Keine         | `normalizeRoomIdentifier`, `getSessionResetSlice`            |
| Abfrage        | Datenausschnitt | Keine         | `selectMyPeerId`, `selectVoipMembers`                        |
| I/O            | `Result<T>`     | Ja (extern)   | `fetchJoinRoom`, `setupRoomParticipant`, `attachRemoteAudio` |

Verboten: **Rollen mischen** (z. B. Validierung + DOM + `fetch` in derselben Funktion ohne Zwischenschritte).

Erreichbar durch: Hilfsfunktionen extrahieren; Zustandsaenderungen wo moeglich ueber **Events** + Reducer statt losem `patchState`.

---

### 2. Nur Plain Data (keine Domain-Klassen)

Nicht verwenden:

- Klassen mit Domain-Methoden
- Getter/Setter in Domain-Logik
- `this` als impliziter Zustand in Fachlogik
- versteckte interne Mutation

Erforderlich:

- Plain Objects und Arrays
- `Map`/`Record` fuer Indexe
- Funktionen, die Daten als Parameter erhalten und neue Daten zurueckgeben

Beispiel:

```typescript
interface Participant {
	peerId: string;
	nick: string;
	muted: boolean;
}

function setParticipantMuted(participant: Participant, muted: boolean): Participant {
	return { ...participant, muted };
}
```

---

### 3. Pure Functions (keine Seiteneffekte)

Pure Funktionen muessen deterministisch sein.

Nicht in Pure Functions:

- DOM-Zugriffe
- `peer.call`, `conn.send`, `fetch`, `localStorage`
- `Date.now()`/`Math.random()` ohne Parameterinjektion
- Mutation von Eingabedaten

I/O ist nur in klar benannten Effektfunktionen erlaubt:

- `fetch*`, `send*`, `read*`, `write*`, `start*`, `stop*`, `attach*`

---

### 4. Result-Typ fuer erwartete Fehler

Verwende `Result<T>` fuer erwartete Fehler in Validierung, Parsing, Netzwerk und Medienoperationen.

```typescript
type Result<T> = { success: true; data: T } | { success: false; error: { code: string; message: string; details?: unknown } };
```

`throw` nur bei Programmierfehlern oder ungueltiger Initialkonfiguration.

Beispiel:

```typescript
function validateJoinPayload(payload: unknown): Result<{ roomId: string; nick: string }> {
	if (!payload || typeof payload !== "object") {
		return { success: false, error: { code: "VALIDATION", message: "Payload fehlt" } };
	}
	const roomId = String((payload as any).roomId || "").trim();
	const nick = String((payload as any).nick || "").trim();
	if (!roomId || !nick) {
		return { success: false, error: { code: "VALIDATION", message: "roomId und nick erforderlich" } };
	}
	return { success: true, data: { roomId, nick } };
}
```

---

### 5. Vier-Schichten-Architektur (strict)

```text
Layer 4: I/O & Orchestration (mediasoup-client, protoo-client, WebRTC, DOM, fetch, storage)
   ->
Layer 3: Domain Operations (Reducer, Domain-Transitionen, Invarianten)
   ->
Layer 2: Generic Utilities (Result-Helper, Collections, Parsing)
   ->
Layer 1: Language Primitives (map/filter/reduce/Object APIs)
```

Regeln:

1. Jede Schicht ruft nur die direkt darunter auf.
2. Kein Springen ueber Schichten.
3. Keine Aufrufe nach oben.
4. Call-Graph bei groesseren Umbauten explizit dokumentieren.

### Architektur-Leitstand (Ist-Zustand, wird ausgebaut)

| Bereich                                                          | Regel                                                                                                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/reducers`                                            | Keine Imports aus `effects/` oder `app/` — nur Domain + `initialState` + reine Slices (z. B. `sessionResetSlice.js`).                  |
| Session-Ende                                                     | `dispatch({ type: 'session/cleared' })` — Patch kommt aus `getSessionResetSlice()` im Reducer, nicht als riesiges Objekt im Bootstrap. |
| Fehlgeschlagener Join/Create nach `room/joined` / `room/created` | `dispatch({ type: 'room/joinAttemptAborted' })` bzw. `room/createAttemptAborted` — Rollback-Patch `getJoinAttemptRollbackSlice()`.     |
| `patchState`                                                     | Legacy-Komposition: schrittweise durch **explizite Events** ersetzen, wo sich der Aufwand lohnt.                                       |

---

## DOP-Umbauprinzipien fuer dieses Projekt

Diese Prinzipien gelten zusaetzlich beim Refactoring.

1. Event-first: Jede Zustandsaenderung kommt aus einem expliziten Event.
2. Single Source of Truth: Kein paralleler Wahrheitszustand fuer dieselbe Information.
3. Reducer sind rein: `(state, event) -> nextState` ohne I/O.
4. Selectors statt ad-hoc Reads: UI liest nur ueber Selektoren.
5. Effects isolieren: mediasoup/protoo, WebRTC, DOM, localStorage nur in `src/effects/*`.
6. Invarianten pruefen: Nach jedem Dispatch Domain-Regeln validieren (mindestens in Dev).
7. Idempotenz: Doppelte/spaete Netzwerk-Events duerfen den Zustand nicht zerstoeren.
8. Reihenfolge bewusst machen: Sequenznummer oder Timestamp-Strategie klar festlegen.
9. Kleine atomare Events statt God-Events.
10. Keine direkten DOM-Updates aus Peer-Callbacks.

---

## Wishful Thinking

Designe zuerst das API, das du willst, danach Implementierung.

```typescript
const result = handleIncomingPeerEvent(event);
```

Dann implementieren:

```typescript
function handleIncomingPeerEvent(event: PeerEvent): Result<AppTransition> {
	return pipelineResult(validatePeerEvent(event), normalizePeerEvent, mapEventToTransition);
}
```

---

## Anti-Pattern-Erkennung

| Anti-Pattern                | Alternative                           |
| --------------------------- | ------------------------------------- |
| Service-Klassen fuer Domain | Plain Functions nach Domain gruppiert |
| Versteckter globaler State  | expliziter Store + Events             |
| DOM-Mutationen querbeet     | UI-Adapter mit klaren Entry-Points    |
| Netzwerklogik in Reducern   | Effekt-Layer (`effects/network`)      |
| Mehrere Member-Modelle      | ein kanonisches Teilnehmermodell      |

---

## Kommunikationsregeln

Sei praezise und knapp.

- Zeige Ergebnis statt Absicht.
- Bei Blockern: eine klare Frage.
- Keine Wiederholung offensichtlicher Dateiinhalte.
- Statusupdates kurz halten.

Update-Format:

```text
Erledigt: <Aenderung>
Naechster Schritt: <naechste Aktion>
```

---

## Test-Strategie

- Teste Verhalten, nicht Implementierungsdetails.
- Unit-Tests fuer Reducer, Selektoren, Invarianten.
- Contract-Tests fuer Peer-/API-Nachrichten.
- Integrations-Tests fuer Kernfluesse.

Pflichtfluesse:

1. Room erstellen und joinen
2. Chat senden/empfangen
3. Mute/Unmute inkl. Remote-Status
4. Screen-Start/Stop/Pause
5. File-Transfer Start/Progress/Ende

---

## Verifizierungs-Checkliste

Vor Commit muss alles erfuellt sein:

- [ ] Jede Funktion hat genau eine Rolle.
- [ ] Domain-Code ist class-frei und datenorientiert.
- [ ] Reducer sind pure und deterministisch.
- [ ] Erwartete Fehler nutzen `Result<T>`.
- [ ] Schicht-Disziplin ist eingehalten.
- [ ] I/O nur in Effektgrenzen.
- [ ] Direkte DOM-Updates aus Netzwerkcallbacks sind entfernt.
- [ ] Keine doppelten Wahrheitsquellen im State.
- [ ] Funktionen sind klein und fokussiert (<=20 Zeilen als Zielwert).

Falls ein Punkt offen ist: Refactoring vor Merge.

### Compliance-Iststand (Repo, grob)

- **Reducer / Domain:** `appReducer` und Slices sind weitgehend pure `(state, event) -> nextState`; `patchState` bleibt als Legacy-Kompositionspfad.
- **Result&lt;T&gt;:** in `client/src/effects/network/api.js` und `client/src/shared/result.js` genutzt; nicht jeder ältere Pfad ist umgestellt.
- **Schichten:** Netzwerk/mediasoup in `effects/network`, UI-Orchestrierung in `effects/ui` / `ui/screens` — gelegentlich große Handler-Funktionen (Zeilenlimit bewusst nicht global erzwungen).
- **Eine Rolle pro Funktion:** Ziel bei neuem Code; bestehende Module (z. B. `roomView.js`, `mediasoupClient.js`) sind orchestration-lastig.
- **UI-Texte:** `src/i18n.js` kann lokalisierte Strings enthalten — das ist **kein** Ersatz für englische Code-Kommentare; Kommentare/JSDoc bleiben Englisch.

---

## Node/Express + WebRTC Spezifika

### Express Handler als I/O-Rand

```typescript
app.post("/api/join", async (req, res) => {
	const parsed = validateJoinPayload(req.body);
	if (!parsed.success) {
		res.status(400).json(parsed.error);
		return;
	}

	const joined = await joinRoomIO(parsed.data);
	if (!joined.success) {
		res.status(404).json(joined.error);
		return;
	}

	res.json(joined.data);
});
```

### Peer-Nachrichten: erst validieren, dann mappen

```typescript
function onPeerData(data: unknown): void {
	const parsed = parsePeerEvent(data);
	if (!parsed.success) return;
	dispatch(parsed.data);
}
```

### File-Transfer und Screen-Events als State-Maschinen

- Transfer-Status pro `fileId`: `idle -> started -> receiving -> completed|failed`
- Screen-Status pro Quelle: `idle -> starting -> live -> paused -> stopping`

---

## Vanilla UI Module Spezifika

UI-Module sind duenn und orchestrieren nur.

- Screen-Module lesen selektierte Daten.
- User-Interaktionen erzeugen Commands/Events.
- Render-Funktionen bleiben frei von Netzwerklogik.

Beispiel:

```typescript
function onSendMessage(text: string): void {
	dispatch({ type: "chat/sendRequested", payload: { text } });
}
```

---

## Empfohlene Projektstruktur

```text
project/
├── src/
│   ├── app/                 # bootstrap, composition root
│   ├── domain/              # reducer, events, selectors, invariants
│   │   ├── events/
│   │   ├── reducers/
│   │   ├── selectors/
│   │   └── invariants/
│   ├── store/               # dispatch, subscriptions, middleware hooks
│   ├── effects/             # side effects only
│   │   ├── network/
│   │   ├── media/
│   │   ├── storage/
│   │   └── ui/
│   ├── features/            # room, chat, media, files orchestration
│   ├── ui/
│   │   ├── screens/
│   │   └── components/
│   ├── protocol/            # message schema, encode/decode, validation
│   ├── shared/              # constants, helpers, type guards
│   └── tests/
│       ├── unit/
│       ├── contract/
│       └── integration/
├── server/
│   └── index.js             # express endpoints, room lifecycle I/O
└── package.json
```

### Migrationshinweis fuer dieses Repo

- `src/main.js`: schrittweise auf `src/app` + `src/store` aufteilen.
- `src/effects/network/mediasoupClient.js`: Protoo + mediasoup; I/O nur hier bzw. `api.js`.
- `src/screens/*`: nach `src/ui/screens` migrieren und nur noch ueber Selectors lesen.
- `server/src/index.js`: I/O-Rand beibehalten, Domain-Regeln in pure Funktionen auslagern.

---

## Weitere Ressourcen

Diese Anweisungen basieren auf:

- SICP (datenorientiertes und funktionales Denken)
- Railway-Oriented Programming (`Result<T>`)
- Clean Architecture (Schichtentrennung)

Bei Unsicherheit: einfachere Loesung mit weniger Abstraktion waehlen.
