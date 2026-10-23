// SQLite schema and helpers shared by the Node server (node:sqlite) and the
// static GitHub Pages build (sql.js in the browser).

export const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email         TEXT UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  bio           TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  dialect       TEXT NOT NULL DEFAULT 'libyan',
  target_days   INTEGER NOT NULL DEFAULT 42,
  daily_goal_xp INTEGER NOT NULL DEFAULT 150,
  retention     REAL NOT NULL DEFAULT 0.9,
  tz_offset_min INTEGER NOT NULL DEFAULT 0,
  is_public     INTEGER NOT NULL DEFAULT 1,
  started_at    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

-- One row per (user, word, direction). direction: 'r' = recognition (Arabic → English),
-- 'p' = production (English → Arabic).
CREATE TABLE IF NOT EXISTS cards (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id     INTEGER NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('r','p')),
  state       TEXT NOT NULL,
  step        INTEGER NOT NULL DEFAULT 0,
  stability   REAL NOT NULL DEFAULT 0,
  difficulty  REAL NOT NULL DEFAULT 0,
  due         INTEGER NOT NULL,
  last_review INTEGER,
  reps        INTEGER NOT NULL DEFAULT 0,
  lapses      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, word_id, direction)
);
CREATE INDEX IF NOT EXISTS cards_due ON cards(user_id, due);

CREATE TABLE IF NOT EXISTS review_log (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id     INTEGER NOT NULL,
  direction   TEXT NOT NULL,
  grade       INTEGER NOT NULL,
  prev_state  TEXT NOT NULL,
  stability   REAL NOT NULL,
  ms_taken    INTEGER,
  ts          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS review_log_user_ts ON review_log(user_id, ts);

-- Daily aggregates power the contribution graph. day = 'YYYY-MM-DD' in the user's local time.
CREATE TABLE IF NOT EXISTS activity (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day       TEXT NOT NULL,
  reviews   INTEGER NOT NULL DEFAULT 0,
  correct   INTEGER NOT NULL DEFAULT 0,
  new_words INTEGER NOT NULL DEFAULT 0,
  drills    INTEGER NOT NULL DEFAULT 0,
  lessons   INTEGER NOT NULL DEFAULT 0,
  xp        INTEGER NOT NULL DEFAULT 0,
  ms_spent  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id    TEXT NOT NULL,
  completed_at INTEGER NOT NULL,
  score        INTEGER,
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS achievements (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, code)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (follower_id, followee_id)
);

CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind    TEXT NOT NULL,
  data    TEXT NOT NULL DEFAULT '{}',
  ts      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_user_ts ON events(user_id, ts);

-- One row per finished round of an arcade word game.
CREATE TABLE IF NOT EXISTS game_scores (
  id       INTEGER PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game     TEXT NOT NULL,
  score    INTEGER NOT NULL,
  correct  INTEGER NOT NULL DEFAULT 0,
  total    INTEGER NOT NULL DEFAULT 0,
  daily    INTEGER NOT NULL DEFAULT 0,
  won      INTEGER NOT NULL DEFAULT 0,
  day      TEXT NOT NULL,
  meta     TEXT NOT NULL DEFAULT '{}',
  ts       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS game_scores_game ON game_scores(game, score);
CREATE INDEX IF NOT EXISTS game_scores_user ON game_scores(user_id, game);
`;

/** Runs fn inside a transaction, rolling back on error. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
