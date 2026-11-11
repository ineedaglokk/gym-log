-- Tables of the FORMA server (Cloudflare D1 = SQLite). Safe to run again: nothing is dropped.
-- Apply: npx wrangler d1 execute forma --remote --file=schema.sql   (server/dev.js applies it by itself)

-- One row per person. nick is the login (lower-cased), name is the nick as it was typed.
-- seq is the revision counter of this person's documents; fails / locked count wrong passwords.
CREATE TABLE IF NOT EXISTS users (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  nick    TEXT    NOT NULL UNIQUE,
  name    TEXT    NOT NULL,
  salt    TEXT    NOT NULL,
  hash    TEXT    NOT NULL,
  iter    INTEGER NOT NULL,
  seq     INTEGER NOT NULL DEFAULT 0,
  fails   INTEGER NOT NULL DEFAULT 0,
  locked  INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);

-- One row per signed-in device. token is the SHA-256 of the device's token, never the token itself.
CREATE TABLE IF NOT EXISTS sessions (
  token   TEXT    PRIMARY KEY,
  user    INTEGER NOT NULL,
  created INTEGER NOT NULL,
  seen    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user);

-- The journal: the same keys as on the device (profile, program, …, d:YYYY-MM-DD), values as JSON text.
-- v NULL = the key was deleted. rev is the value of users.seq when the key was last written.
CREATE TABLE IF NOT EXISTS docs (
  user INTEGER NOT NULL,
  k    TEXT    NOT NULL,
  v    TEXT,
  rev  INTEGER NOT NULL,
  PRIMARY KEY (user, k)
);
CREATE INDEX IF NOT EXISTS docs_rev ON docs (user, rev);

-- How many questions a person asked the assistants on a day (UTC).
CREATE TABLE IF NOT EXISTS usage (
  user INTEGER NOT NULL,
  day  TEXT    NOT NULL,
  n    INTEGER NOT NULL,
  PRIMARY KEY (user, day)
);
