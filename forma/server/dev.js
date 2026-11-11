/* Local stand-in for the deployed server: the same worker.js on Node, an SQLite file instead of D1,
   a canned answer instead of the language model. For development and the preview only.
   Run from forma/:  node server/dev.js   → http://localhost:8787   (the app on localhost uses it by itself)
   A phone in the same Wi-Fi can use it too: open http://<this computer's address>:8765/forma/ there.
   Its database is server/.dev/forma.sqlite (not in git); delete the file to start clean. */

import http from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import worker from "./worker.js";
import { d1 } from "./d1-node.js";

const at = rel => fileURLToPath(new URL(rel, import.meta.url));
const PORT = Number(process.env.PORT) || 8787;

mkdirSync(at("./.dev/"), { recursive: true });
const DB = d1(at("./.dev/forma.sqlite"));
DB.script(readFileSync(at("./schema.sql"), "utf8"));

/* pages opened from this computer or from the home network may call this server (development only) */
const HOME = /^http:\/\/(localhost|127\.0\.0\.1|10(\.\d+){3}|192\.168(\.\d+){2}|172\.(1[6-9]|2\d|3[01])(\.\d+){2}|[a-z0-9-]+\.local)(:\d+)?$/i;

const env = {
  DB,
  ALLOWED_ORIGINS: "http://localhost:8765",
  DAILY_LIMIT: "40",
  MODEL: "dev",
  AI: { run: async () => ({ response: "Это ответ-заглушка локального сервера. Настоящая модель отвечает после выкладки на Cloudflare." }) },
};

http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const request = new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers: req.headers, body: hasBody ? Buffer.concat(chunks) : undefined });
    const origin = req.headers.origin || "";
    const out = await worker.fetch(request, HOME.test(origin) ? { ...env, ALLOWED_ORIGINS: origin } : env);
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  } catch (err) {
    console.error("dev server failed", err);
    res.writeHead(500).end("dev server error");
  }
}).listen(PORT, () => console.log(`FORMA dev server: http://localhost:${PORT}`));
