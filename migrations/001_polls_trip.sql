-- 001: tripcodes (firma pseudónima sin cuenta) + encuestas anónimas.
-- ojo: el ALTER TABLE no es idempotente — si ya está aplicada da "duplicate column"
-- (se ignora, patrón twoitter).

ALTER TABLE foro_replies ADD COLUMN trip TEXT;

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
