# Nginx Proxy Manager + EasyMeet (Protoo `/ws`)

Die Web-App spricht **Protoo** über **`wss://<deine-domain>/ws`** (gleicher Host wie HTTPS, Port **443**). Dafür muss NPM den **WebSocket** korrekt zum EasyMeet-Container durchreichen.

## Proxy Host (SSL)

- **Domain:** z. B. `easymeet.example.com`
- **Scheme:** `http`
- **Forward Hostname / IP:** Name des EasyMeet-Containers im Docker-Netz (z. B. `easymeet-app-1` oder Service-Name)
- **Forward Port:** `3001` (intern – **nicht** in der Browser-URL sichtbar)

## WebSockets einschalten

In NPM beim Proxy Host unter **Advanced** oder den entsprechenden Einstellungen:

- **Websockets Support** aktivieren (falls vorhanden).

Ohne WebSocket-Upgrade schlägt **`wss://…/ws`** fehl, während `/api` per HTTP noch gehen kann.

## Custom Nginx (falls nötig)

Falls die GUI nicht reicht, typisch zusätzlich (Konzept):

```nginx
location /ws {
    proxy_pass http://UPSTREAM:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;
}
```

(`UPSTREAM` = interner Container-Name/Service.)

## Medien (UDP)

RTP bleibt **UDP** auf dem `RTC_*`-Bereich – das ist **unabhängig** von NPM (kein HTTP-Proxy für UDP). Separat bis zum Host/Container durchreichen.
