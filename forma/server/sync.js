/* Journal sync: one request both sends what changed on the device and returns what changed in the account.

   POST /sync { since, changes: [{ k, v }] }  →  { cursor, conflicts: [k], changes: [{ k, v }] }
     since     the cursor the device got last time (0 on a new device: everything comes back)
     changes   keys changed on the device; v null = deleted
     cursor    remember it and send as the next "since"
     changes   (answer) keys written by other devices after "since"; v null = deleted
     conflicts keys from the request that were NOT saved, because another device changed them after
               "since". Their current values are in "changes": the device merges and sends again.

   Every person has a counter (users.seq); a saved key gets the next number as its rev. "Changed after
   since" is simply rev > since. The write is one transaction guarded by the counter, so two devices
   writing at the same moment cannot both pass: the loser is retried against the fresh state. */

import { fail } from "./http.js";

export const SYNC = { maxBodyChars: 700000, maxChanges: 100, maxValueChars: 400000, maxDocs: 6000 };
const KEY = /^(profile|program|settings|foods|favs|recent|gone|chats|d:\d{4}-\d{2}-\d{2})$/;

/* validates the request body → { since, changes: [{ k, v: JSON text | null }] } */
export function checkSync(body) {
  if (!body || typeof body !== "object") throw fail(400, "bad body");
  const since = Number.isInteger(body.since) && body.since > 0 ? body.since : 0;
  const list = body.changes == null ? [] : body.changes;
  if (!Array.isArray(list)) throw fail(400, "bad changes");
  if (list.length > SYNC.maxChanges) throw fail(413, "too many changes");
  const seen = new Set();
  const changes = list.map(c => {
    if (!c || typeof c.k !== "string" || !KEY.test(c.k) || seen.has(c.k)) throw fail(400, "bad key");
    seen.add(c.k);
    if (c.v == null) return { k: c.k, v: null };
    if (typeof c.v !== "object") throw fail(400, "bad value");
    const v = JSON.stringify(c.v);
    if (v.length > SYNC.maxValueChars) throw fail(413, "value too large");
    return { k: c.k, v };
  });
  return { since, changes };
}

/* → { cursor, conflicts: [k], rows: [{ k, v: JSON text | null }] } */
export async function syncDocs(db, userId, { since, changes }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { seq } = await db.prepare("SELECT seq FROM users WHERE id = ?1").bind(userId).first();
    /* a device that is ahead of the server (the database was restored or reset) gets everything again */
    const from = since > seq ? 0 : since;
    const rows = (await db.prepare("SELECT k, v FROM docs WHERE user = ?1 AND rev > ?2 ORDER BY rev").bind(userId, from).all()).results;
    const changed = new Set(rows.map(r => r.k));
    const accept = changes.filter(c => !changed.has(c.k)), conflicts = changes.filter(c => changed.has(c.k)).map(c => c.k);
    if (!accept.length) return { cursor: seq, conflicts, rows };

    const { n } = await db.prepare("SELECT COUNT(*) AS n FROM docs WHERE user = ?1").bind(userId).first();
    if (n + accept.length > SYNC.maxDocs) throw fail(413, "account is full");
    /* both statements see the counter as it was read above, or neither changes anything */
    const done = await db.batch([
      db.prepare(`INSERT INTO docs (user, k, v, rev)
        SELECT ?1, json_extract(j.value, '$.k'), json_extract(j.value, '$.v'), ?3 + j.key + 1
        FROM json_each(?2) AS j
        WHERE (SELECT seq FROM users WHERE id = ?1) = ?3
        ON CONFLICT (user, k) DO UPDATE SET v = excluded.v, rev = excluded.rev`).bind(userId, JSON.stringify(accept), seq),
      db.prepare("UPDATE users SET seq = ?1 WHERE id = ?2 AND seq = ?3").bind(seq + accept.length, userId, seq),
    ]);
    if (done[1].meta.changes === 1) return { cursor: seq + accept.length, conflicts, rows };
  }
  throw fail(503, "busy");
}

/* the answer as JSON text; stored values are already JSON, so they are put in as they are */
export const syncJson = ({ cursor, conflicts, rows }) =>
  `{"cursor":${cursor},"conflicts":${JSON.stringify(conflicts)},"changes":[${rows.map(r => `{"k":${JSON.stringify(r.k)},"v":${r.v == null ? "null" : r.v}}`).join(",")}]}`;
