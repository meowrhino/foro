# foro

foro anónimo minimalista y white-label sobre cloudflare. un admin publica preguntas;
cualquiera responde sin cuenta (con alias opcional), con texto e imágenes
(convertidas a webp en el cliente). cola de moderación integrada.

fusión de [arxiu](https://github.com/meowrhino/arxiu) (subida anónima + moderación)
y [twoitter](https://github.com/meowrhino/twoitter) (hilos + composer + compresión).
diseño heredado de [paac.cat](https://paac.cat): courier + times + bloques planos de color.

## arquitectura

- **worker** (`worker/worker.js`): api rest vanilla, sin dependencias. sirve también
  los estáticos de `public/` (assets binding) y los media de r2 (`/r2/*`).
- **d1**: tablas `foro_questions`, `foro_replies`, `foro_media`. en fase de pruebas
  conviven en la d1 compartida `shop` vía prefijo (`TABLE_PREFIX` en wrangler.toml).
- **r2** `foro-media`: imágenes de las respuestas.
- **rate-limit**: binding nativo de workers (8 escrituras/min por ip).

## white-label

toda la identidad vive en [`public/config.json`](public/config.json): nombre, cliente,
paleta, textos, idioma y reglas (cola de moderación on/off, media on/off, límites).
rebrandear para otro cliente = editar ese archivo + cambiar `TABLE_PREFIX` (o darle
d1 propia) en `wrangler.toml`. cero cambios de código.

## endpoints

- `GET  /api/questions` → preguntas + nº de respuestas aprobadas
- `GET  /api/questions/:id` → pregunta + respuestas (admin ve también pendientes)
- `POST /api/questions/:id/replies` → multipart: `alias?`, `body`, `files[]` (público)
- `POST /api/questions` → crear pregunta (admin)
- `GET  /api/moderation` → cola de pendientes (admin)
- `POST /api/moderate` → `{id, action: approve|reject|delete}` (admin)
- `POST /api/login` · `POST /api/logout` · `GET /api/me`
- `GET  /r2/:key` → sirve media

todo POST exige el header `x-foro-csrf` (cualquier valor).

## desarrollo local

```bash
# secrets locales (gitignored): crear .dev.vars con
#   ADMIN_PASSWORD=...
#   AUTH_SECRET=...

npm run db:migrate     # aplica schema.sql a la d1 LOCAL (.wrangler/)
npm run dev            # http://localhost:8787
```

admin en `/admin.html` (contraseña de `.dev.vars`).

## deploy

```bash
npm run r2:create            # primera vez: bucket foro-media
npm run db:migrate:remote    # crea tablas foro_* en la d1 `shop`
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put AUTH_SECRET
npm run deploy
```

## traspaso a la cuenta de un cliente (p.ej. PAAC)

1. en la cuenta destino: `wrangler d1 create foro-db` + `wrangler r2 bucket create foro-media`.
2. actualizar `[[d1_databases]]` en wrangler.toml con la nueva db (y `TABLE_PREFIX` si se quiere sin prefijo).
3. exportar datos: `wrangler d1 export shop --remote --table foro_questions` (etc.) → import en destino.
4. sync del bucket r2, secrets, `wrangler deploy`, y dns (`foro.cliente.tld`).

## tripcodes

para firmar sin cuenta: escribe `nom#clau` en el campo de alias. se publica como
`nom !a1b2c3` — el hash sale de la clau (+ secret del server), así que quien conozca
la clau puede firmar igual en cualquier hilo y nadie puede suplantarla. la clau
nunca se guarda.

## encuestas

al crear una pregunta el admin puede añadir 2-10 opciones (una por línea). voto
único e inmutable por cookie firmada anónima (`foro_voter`), resultados siempre
visibles. `POST /api/questions/:id/vote {idx}`.

## backup

- manual: botón "descarregar backup (json)" en el panel (o `GET /api/export`).
- cron semanal (lunes 4:04 utc): vuelca el índice a r2 (`backup/foro-<fecha>.json`).
  para que además lo commitee a github como `data.json`, poner secrets
  `GITHUB_TOKEN` (pat scope repo) y `BACKUP_REPO` (p.ej. `meowrhino/foro`).
- las imágenes de r2 no van en el json; para copiarlas: `rclone` o `wrangler r2 object get`.

## fases

- [x] mvp: preguntas admin + respuestas anónimas (texto + imágenes webp) + moderación
- [x] cerrar/reabrir/fijar preguntas desde el panel · arxiu de preguntas cerradas
- [x] borrar respuestas aprobadas (botón admin en el hilo) · export json · backup cron
- [x] tripcodes (`nom#clau`) · encuestas anónimas
- [ ] citas `>>N` con preview al hover · archivos/pdfs (patrón arxiu)
- [ ] notas de voz + transcripción whisper · plantillas para exportar piezas a ig/mastodon
