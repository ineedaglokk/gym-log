/* Small HTTP helpers shared by the server's routes: errors that carry a status, the bearer token,
   CORS headers, reading a JSON body with a size cap. No Cloudflare APIs here. */

/* thrown anywhere in a route; the worker turns it into { error: code, ...extra } with this status */
export class HttpError extends Error {
  constructor(status, code, extra = {}) { super(code); this.status = status; this.code = code; this.extra = extra; }
}
export const fail = (status, code, extra) => new HttpError(status, code, extra);

export const bearer = header => { const m = /^Bearer\s+(.+)$/i.exec(String(header || "").trim()); return m ? m[1].trim() : ""; };

export function corsHeaders(origin, allowed) {
  const list = String(allowed || "").split(",").map(s => s.trim()).filter(Boolean);
  const ok = origin && list.includes(origin);
  return {
    "access-control-allow-origin": ok ? origin : list[0] || "null",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

/* the parsed JSON body; 413 when it is longer than maxChars, 400 when it is not JSON */
export async function readJson(req, maxChars) {
  if (Number(req.headers.get("content-length")) > maxChars * 4) throw fail(413, "too large");
  const text = await req.text();
  if (text.length > maxChars) throw fail(413, "too large");
  try { return JSON.parse(text); }
  catch { throw fail(400, "bad json"); }
}
