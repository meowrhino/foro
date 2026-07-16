-- foro: tablas con prefijo foro_ (conviven en la d1 compartida `shop`,
-- patrón shop/tatara). para otro cliente con otro prefijo: sed 's/foro_/cliente_/g'
-- y ajustar TABLE_PREFIX en wrangler.toml.

CREATE TABLE IF NOT EXISTS foro_questions (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  color      INTEGER NOT NULL DEFAULT 0,          -- índice en config.palette
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at  TEXT
);

CREATE TABLE IF NOT EXISTS foro_replies (
  id          TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  num         INTEGER NOT NULL,                   -- nº correlativo dentro de la pregunta
  alias       TEXT,                               -- null = anònim
  trip        TEXT,                               -- tripcode: firma pseudónima (alias#clau → !hash)
  body        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending',    -- pending | ok | rejected | deleted
  ip_hash     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS foro_replies_q ON foro_replies (question_id, status, num);

CREATE TABLE IF NOT EXISTS foro_media (
  id            TEXT PRIMARY KEY,
  reply_id      TEXT NOT NULL,
  r2_key        TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'image',    -- image | file | audio (fases 2-3)
  size          INTEGER,
  original_name TEXT
);
CREATE INDEX IF NOT EXISTS foro_media_r ON foro_media (reply_id);

-- encuestas anónimas (voto único e inmutable por cookie firmada, patrón twoitter)
CREATE TABLE IF NOT EXISTS foro_poll_options (
  question_id TEXT NOT NULL,
  idx         INTEGER NOT NULL,
  text        TEXT NOT NULL,
  PRIMARY KEY (question_id, idx)
);

CREATE TABLE IF NOT EXISTS foro_poll_votes (
  question_id TEXT NOT NULL,
  voter_id    TEXT NOT NULL,
  option_idx  INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (question_id, voter_id)
);
