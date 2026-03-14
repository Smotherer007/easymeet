# GitHub Copilot Instructions

## Sprache und Umgebung

- **Hauptsprache**: JavaScript (TypeScript-ready)
- **Frontend**: Vite + Browser APIs + modulare Screens
- **Backend**: Node.js + Express
- **Realtime**: PeerJS/WebRTC (Data + Media Channels)
- **Zielplattform**: Browser Client + Node Server

---

## Verbindliche Programmier-Prinzipien

Diese Regeln sind verpflichtend, keine Vorschlaege.

### 1. Eine Funktion = Eine Rolle (<=20 Zeilen)

Jede Funktion erfuellt genau eine Aufgabe.

| Rolle              | Rueckgabe       | Seiteneffekte | Beispiele |
| ------------------ | --------------- | ------------- | --------- |
| Validierung        | `Result<T>`     | Keine         | `validateJoinRequest`, `validateChatMessage` |
| Transformation     | Neue Daten      | Keine         | `normalizePeerEvent`, `buildViewModel` |
| Abfrage            | Datenausschnitt | Keine         | `selectActiveParticipants`, `findTransferById` |
| I/O                | `Result<T>`     | Ja (extern)   | `fetchRoomStatus`, `sendPeerMessage`, `savePeerVolumes` |

Verboten: Rollen mischen (Validierung + DOM + Netzwerk in derselben Funktion).

Erforderlich: Trenne in kleine, klar benannte Funktionen.

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
type Result<T> =
	| { success: true; data: T }
	| { success: false; error: { code: string; message: string; details?: unknown } };
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
Layer 4: I/O & Orchestration (PeerJS, WebRTC, DOM, fetch, storage)
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

---

## DOP-Umbauprinzipien fuer dieses Projekt

Diese Prinzipien gelten zusaetzlich beim Refactoring.

1. Event-first: Jede Zustandsaenderung kommt aus einem expliziten Event.
2. Single Source of Truth: Kein paralleler Wahrheitszustand fuer dieselbe Information.
3. Reducer sind rein: `(state, event) -> nextState` ohne I/O.
4. Selectors statt ad-hoc Reads: UI liest nur ueber Selektoren.
5. Effects isolieren: PeerJS, WebRTC, DOM, localStorage nur in `src/effects/*`.
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

| Anti-Pattern | Alternative |
| ------------ | ----------- |
| Service-Klassen fuer Domain | Plain Functions nach Domain gruppiert |
| Versteckter globaler State | expliziter Store + Events |
| DOM-Mutationen querbeet | UI-Adapter mit klaren Entry-Points |
| Netzwerklogik in Reducern | Effekt-Layer (`effects/network`) |
| Mehrere Member-Modelle | ein kanonisches Teilnehmermodell |

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
- `src/peer.js`: in `effects/network` + `protocol` + domain events zerlegen.
- `src/screens/*`: nach `src/ui/screens` migrieren und nur noch ueber Selectors lesen.
- `server/index.js`: I/O-Rand beibehalten, Domain-Regeln in pure Funktionen auslagern.

---

## Weitere Ressourcen

Diese Anweisungen basieren auf:

- SICP (datenorientiertes und funktionales Denken)
- Railway-Oriented Programming (`Result<T>`)
- Clean Architecture (Schichtentrennung)

Bei Unsicherheit: einfachere Loesung mit weniger Abstraktion waehlen.
