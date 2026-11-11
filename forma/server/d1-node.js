/* The part of Cloudflare's D1 API the server uses, on top of Node's built-in SQLite — so the real
   worker code and its real SQL run in tests and in server/dev.js without Cloudflare.
   Covered: prepare(sql).bind(…).first() / .all() / .run(), batch([statements]) as one transaction. */

import { DatabaseSync } from "node:sqlite";

const READS = /^\s*(SELECT|WITH)\b|\bRETURNING\b/i;

export function d1(file = ":memory:") {
  const db = new DatabaseSync(file);
  const rows = (sql, args) => db.prepare(sql).all(...args).map(r => ({ ...r }));
  const write = (sql, args) => {
    const r = db.prepare(sql).run(...args);
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const exec = (sql, args) => (READS.test(sql) ? { success: true, results: rows(sql, args), meta: { changes: 0 } } : write(sql, args));
  const statement = (sql, args = []) => ({
    bind: (...a) => statement(sql, a),
    first: async () => rows(sql, args)[0] ?? null,
    all: async () => ({ success: true, results: rows(sql, args), meta: { changes: 0 } }),
    run: async () => exec(sql, args),
    now: () => exec(sql, args),
  });
  return {
    prepare: sql => statement(sql),
    async batch(list) {
      db.exec("BEGIN IMMEDIATE");
      try { const out = list.map(s => s.now()); db.exec("COMMIT"); return out; }
      catch (err) { db.exec("ROLLBACK"); throw err; }
    },
    /* not part of D1's statement API: runs a whole .sql file (the schema) */
    script: sql => db.exec(sql),
    close: () => db.close(),
  };
}
