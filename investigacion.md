# investigación: foro — foro anónimo para la PAAC

> convocatoria PAAC (Plataforma Assembleària d'Artistes de Catalunya) — trabajo en redes.
> idea: fusión de **arxiu** + **twoitter** → un foro participativo, anónimo, hecho de 0.
> investigar y experimentar con un internet más participativo y anterior (foros, tablones, imageboards) pero con una infraestructura propia y cuidada.
>
> **nombre de trabajo: `foro`** (en la línea de arxiu/twoitter: minúscula, genérico, directo).
> **doble objetivo**: pieza para la convocatoria PAAC **y** producto white-label vendible a otros clientes.

---

## 1. el concepto

- un lugar donde un **admin** (la PAAC / quien lleve las redes) lanza **preguntas o temas**.
- **cualquiera** puede responder sin cuenta: anónimo puro o con un nombre/alias opcional.
- las respuestas pueden llevar **texto, imágenes y archivos** (con conversor/compresor integrado).
- referentes de espíritu: los foros y tablones del internet anterior (4chan, foros phpBB, guestbooks), pero **hecho de 0**, con estética propia — así el proyecto no es "instalamos un software", sino **crear la infraestructura** misma. eso es lo que tiene valor para la convocatoria.

los imageboards demuestran que este modelo (hilos anónimos + imágenes + nombre opcional) funciona desde hace 20+ años. lo que **no existe** es una versión pequeña, cuidada y con identidad propia de eso. ahí está el hueco.

---

## 2. lo que ya tenemos construido

los dos repos son 100% cloudflare (workers + d1 + r2 + kv) → encajan sin fricción, hosting ~0€.

### de arxiu (`~/Documents/GitHub/arxiu`)
subida anónima con moderación:
- subida de archivos **sin cuenta**, campo `author` opcional → exactamente el modelo "anónimo que puede o no poner su nombre"
- moderación por token (`POST /moderate`: flag / delete)
- rate-limit por KV
- backup automático semanal d1→json + r2→repo github
- estética retro de explorador de archivos

### de twoitter (`~/Documents/GitHub/twoitter`)
posts con hilos y media:
- **hilos** con respuestas (`parent_id`), replies colapsables → eso ES el foro
- **composer completo**: paste (cmd+v), drag & drop, previews
- **conversor integrado ya hecho**: imagen→WebP (canvas/wasm), vídeo→VP8/WebM (ffmpeg.wasm), audio→Opus, editor de recorte (crop + trim)
- auth por contraseña con cookie firmada (HMAC) → sirve tal cual para el admin
- encuestas con voto anónimo por cookie firmada → bonus muy interesante para participación
- rate-limiters nativos de workers, CSRF, soft-delete
- notas de voz + transcripción whisper (workers ai)

### mapa de reutilización

| pieza del foro | de dónde sale |
|---|---|
| preguntas (posts raíz, solo admin) | twoitter: posts + auth |
| respuestas anónimas con nombre opcional | arxiu: campo `author` / twoitter: replies |
| imágenes comprimidas en cliente | twoitter: compressor.js (webp) |
| archivos/pdfs adjuntos | arxiu: flujo upload→r2 |
| moderación | arxiu: token + flag/delete · twoitter: soft-delete |
| anti-spam | arxiu: kv rate-limit · twoitter: rate-limiters nativos |
| encuestas anónimas (fase 2) | twoitter: polls completas |
| notas de voz (fase 2) | twoitter: recorder + whisper |

---

## 3. panorama: qué hay ya hecho

| categoría | ejemplos | por qué no encaja |
|---|---|---|
| foros clásicos | Discourse, Flarum, NodeBB, phpBB, MyBB | pensados para comunidades con cuentas; anonimato es un parche; necesitan VPS (php/node/postgres) |
| Q&A tipo stack overflow | Apache Answer, Question2Answer, Scoold, Askbot | orientados a "respuesta correcta" con votos y reputación, no a conversación abierta anónima |
| tablones tipo padlet | Padlet (cerrado, de pago); Spacedeck, mindwendel (open source) | lo más cercano en espíritu (admin lanza pregunta, gente cuelga cosas anónimas) pero sin hilos y con self-hosting flojo |
| participación ciudadana | **Decidim** (hecho en Barcelona), Consul | referente conceptual MUY citable en la memoria de la convocatoria, pero mastodontes institucionales (rails + postgres) |
| imageboards / textboards | vichan, jschan, TinyIB | el modelo de datos exacto que queremos, pero estética/asociaciones 4chan y hosting php. **referente directo de mecánica** |
| sistemas de comentarios | Isso, Remark42, Commento | hackeable (cada pregunta = una página con comentarios anónimos) pero subida de archivos muy limitada |

fuentes:
- https://openalternative.co/categories/forum-software/self-hosted
- https://alternativeto.net/software/discourse/?platform=self-hosted
- https://scoold.com/blog/best-self-hosted-q-a-platforms-2026/
- https://answer.apache.org/
- https://alternativeto.net/software/padlet/?license=opensource
- https://itsfoss.com/open-source-forum-software/
- https://decidim.org/ (referente conceptual, participación digital nacida en bcn)

**conclusión**: construirlo nosotros. el código difícil ya está escrito y en producción en los dos repos, y para la convocatoria la pieza propia ES el proyecto.

---

## 4. notas de diseño: paac.cat

capturado del css en vivo (2026-07):

### paleta (bloques planos, sin degradados ni bordes redondeados)
- verde: `rgb(126, 255, 154)` → `#7EFF9A` (el más usado)
- azul cielo: `rgb(134, 211, 255)` → `#86D3FF`
- coral: `rgb(255, 134, 107)` → `#FF866B` (para comunicados/urgente)
- lila: `rgb(151, 125, 255)` → `#977DFF` (puntual)
- texto: negro puro sobre los bloques de color; fondo base blanco

### tipografía (toda de sistema, cero webfonts)
- **Courier New** (mono) → navegación, etiquetas, metadatos. con superíndices numéricos contando ítems por sección (ej: `Nosaltres¹⁵⁶`)
- **Times New Roman bold** → titulares gigantes (100px en portada)
- **Helvetica/Arial** → cuerpo de texto

### layout y carácter
- sidebar izquierda fija con el árbol de secciones en mono + contadores
- grid de tarjetas de colores planos, cada una con su etiqueta mono arriba (`Qui som?`, `Comunicats`)
- links subrayados clásicos
- imágenes en b/n que se tiñen con el color del bloque
- vibe: brutalismo web / periódico / fanzine. **casa perfectamente con la estética de arxiu y con el espíritu "internet anterior" del proyecto** — courier ya es el idioma visual de arxiu

### ideas para el foro
- cada **pregunta** = una tarjeta de color plano (rotando la paleta paac)
- contador de respuestas en superíndice mono, como los contadores del menú de paac.cat
- titular de la pregunta en times bold gigante; respuestas en helvetica; metadatos (fecha, alias, nº) en courier
- respuestas numeradas tipo imageboard (`#001`, `#002`) — mecánica de citar por número (`>>001`) como en los tablones clásicos

---

## 5. cómo funcionaría (modelo propuesto)

```
admin (contraseña, cookie firmada — auth de twoitter)
  └─ crea PREGUNTAS (posts raíz)
       └─ cualquiera responde SIN CUENTA:
            - alias opcional (o "anònim")
            - texto + imágenes (webp en cliente) + archivos (pdf etc → r2)
            - respuestas anidadas o planas (a decidir)
       └─ moderación: flag/delete por token + posible cola de aprobación
```

### stack
- frontend: cloudflare pages, html/css/js vainilla (como arxiu)
- api: worker (hono como twoitter, o vanilla como arxiu)
- d1: tablas `questions`, `replies`, `media`
- r2: adjuntos
- kv / rate-limiters nativos: anti-spam
- cron: backup semanal a github (patrón arxiu)

### esquema d1 (borrador)

tablas con prefijo `foro_` (ver §infra de pruebas):

```sql
foro_questions: id, title, body, color, created_at, closed_at, pinned
foro_replies:   id, question_id, parent_id (nullable), num (nº por hilo),
                alias (nullable), body, created_at, status (pending/ok/flagged/deleted), ip_hash
foro_media:     id, reply_id, r2_key, kind (image/file/audio), size, original_name
```

### infra de pruebas (decidido 2026-07)

- durante el desarrollo, `foro` usa la **d1 `shop`** ya existente en la cuenta cloudflare propia
  (uuid `6c1c1e51-76d4-4ab3-a912-7e7ad2749eca`).
- esa db ya se comparte entre proyectos por **prefijo de tabla** (`stock`… y `tatara_stock`…),
  así que el foro entra con el prefijo `foro_*` sin tocar nada de lo existente.
- si sale adelante con la PAAC, se **traspasa a su cuenta cloudflare**: el diseño debe asumir
  esa migración desde el día 1 (ver §producto).

---

## 5b. foro como producto (white-label)

la meta: que el mismo código sirva para la PAAC hoy y para cualquier cliente mañana.

### principios de diseño

1. **toda la identidad en un solo archivo de configuración** (`config.json` o vars de wrangler):
   nombre del sitio, paleta de colores, textos de la ui, idioma(s), reglas
   (cola de moderación on/off, media on/off, tamaño máximo de archivos, alias obligatorio o no).
   rebrandear para un cliente = editar un archivo, cero código.
2. **modelo "un deploy por cliente"** (no multi-tenant con un solo worker):
   - cada cliente = su worker + sus tablas (o su d1) + su bucket r2, en la cuenta que toque.
   - es el patrón que ya usas con shop/tatara, y hace el traspaso trivial:
     `wrangler deploy` en la cuenta del cliente + `d1 export/import` + sync de r2.
   - sin datos de clientes mezclados → mejor argumento de venta (privacidad, autonomía).
3. **prefijo de tabla configurable** (`TABLE_PREFIX = "foro_"`): permite tanto db compartida
   (fase pruebas, clientes low-cost) como db dedicada (clientes serios), con el mismo código.
4. **cero dependencias de runtime** más allá de cloudflare: html/css/js vainilla + worker.
   el coste marginal de cada cliente es ~0€ (free tier), el margen es todo.

### camino de traspaso a la PAAC (si sale)

1. crear en la cuenta PAAC: d1 `foro-db` + r2 `foro-media` + worker.
2. `wrangler d1 export` (tablas `foro_*`) → import en la nueva db (quitando el prefijo si se quiere).
3. sync del bucket r2, `wrangler secret put` (admin password, moderation token), deploy.
4. dns: `foro.paac.cat` → pages + `api.foro.paac.cat` → worker.

### qué se vende

- setup + deploy en la cuenta del cliente (o alojado en la nuestra con mantenimiento anual).
- personalización de paleta/textos (ya es solo config).
- extras por fases: encuestas, notas de voz + transcripción, export/archivo público.

### fases
1. **mvp**: preguntas del admin + respuestas anónimas de texto + imágenes (compresor ya hecho) + moderación
2. archivos/pdfs (patrón arxiu), citas por número (`>>001`), rss/atom
3. encuestas anónimas (ya hechas en twoitter), notas de voz + transcripción, export/archivo público

---

## 6. decisiones abiertas

- [ ] **publicación directa vs cola de aprobación** — para algo con nombre institucional (PAAC) detrás, la cola de aprobación cubre las espaldas y es trivial (campo `status`). recomendación: cola ON por defecto, desactivable por pregunta.
- [ ] **solo texto vs media** — recomendación: texto + imágenes en el mvp (el conversor ya existe, es la parte gratis); archivos en fase 2. solo-texto simplifica moderación pero pierde lo que hace especial la fusión.
- [ ] respuestas **anidadas** (hilos tipo twoitter) vs **planas numeradas** (tipo imageboard/foro clásico). lo plano-numerado es más "internet anterior" y más simple.
- [ ] ¿tripcodes? (identidad pseudónima verificable sin cuenta, como 4chan: alias#contraseña → hash) — muy del espíritu del proyecto.
- [ ] ¿las preguntas caducan/se archivan? un "arxiu" de preguntas cerradas conectaría los dos proyectos también conceptualmente.
- [ ] idiomas: paac.cat es ca/es/en. ¿el foro en catalán con ui mínima trilingüe?
- [x] nombre del proyecto → **foro**
- [x] infra de pruebas → d1 `shop` con tablas `foro_*` (patrón shop/tatara)
- [x] arquitectura de producto → white-label, config-driven, un deploy por cliente

---

## 7. argumentario para la memoria de la convocatoria

- recuperar la web participativa pre-plataformas (foros, tablones, guestbooks) con infraestructura **propia, pequeña y auditable** — ni algoritmos ni cuentas ni tracking.
- anonimato como herramienta de participación horizontal (encaja con lo assembleari de la PAAC: bústia de queixes, asambleas).
- software de código abierto, hosting de coste ~0, autonomía tecnológica del colectivo.
- referentes citables: Decidim (participación digital bcn), la tradición imageboard/textboard, el net-art y la web brutalista.
- continuidad con obra propia ya en producción (arxiu, twoitter) → viabilidad demostrada.
