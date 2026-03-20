# Docker: Container startet nicht – „port is already allocated“

## Wichtig: `EXPOSE` im Dockerfile bindet **keine** Host-Ports

`EXPOSE` ist nur **Metadaten** im Image. **Erst** `ports:` in **Compose** oder `docker run -p …` veröffentlicht Ports auf `0.0.0.0` am Host.

Wenn Docker trotzdem **„Bind for 0.0.0.0:40000“** meldet, kommt das **fast immer** von einer **Compose-Datei**, die `ports:` setzt – nicht vom Dockerfile.

## 1. Effektive Konfiguration anzeigen

Im Verzeichnis, aus dem ihr `docker compose up` startet:

```bash
docker compose config
```

Unter `services:` → euer EasyMeet-Service: Gibt es **`ports:`**? Wenn ja, **diese** Zeilen verursachen die Bindings.

## 2. Häufige Quelle: `docker-compose.override.yml`

Docker Compose lädt **automatisch** (wenn vorhanden):

- `docker-compose.override.yml`

neben `docker-compose.yml`. Darin stehen oft noch **alte** Einträge wie:

```yaml
ports:
  - "3001:3001"
  - "40000-40200:40000-40200/udp"
```

**Lösung:** `ports:` in der Override-Datei **entfernen** oder die Datei **umbenennen** (z. B. `docker-compose.override.yml.bak`), wenn ihr **nur intern** über Nginx Proxy Manager / gleiches Docker-Netz routet.

## 3. Weitere Quellen

- **`COMPOSE_FILE`** in der Shell: mehrere Dateien werden gemerged.
- **Portainer / andere UI:** Stack-YAML prüfen, ob dort noch `ports:` steht.
- **Anderer Container** nutzt dieselbe Host-Portnummer → `docker ps` prüfen.

## 4. Setup „nur intern“ (z. B. NPM im Netz `frontend`)

- In **`docker-compose.yml`** (Repo): **keine** `ports:` (Stand: nur `networks:`).
- NPM und EasyMeet im **gleichen** Netz; NPM leitet **HTTP/HTTPS** auf `http://<service-name>:3001` (intern).
- **UDP RTP** (40000–40200) ist **separat** von NPM zu klären (Firewall / Host-Routing / TURN) – NPM ersetzt keinen UDP-Port-Mapping für mediasoup.

## 5. Nur lokal am Host testen

Wenn ihr **bewusst** Host-Ports braucht, legt eine **zweite** Datei an, die ihr **explizit** mit `-f` nutzt, z. B. `docker-compose.host-ports.yml`, und startet mit:

```bash
docker compose -f docker-compose.yml -f docker-compose.host-ports.yml up -d
```

So bleibt die Standard-Compose **ohne** Host-Publishing für Production/intern.
